import asyncio
import time
import importlib
import logging
import os

from config.config import get_launchlms_config
from fastapi import FastAPI, Request
from sqlalchemy import event
from sqlalchemy.pool import QueuePool
from sqlmodel import Session, create_engine


def import_all_models():
    # List of directories to scan for models
    model_configs = [
        {'base_dir': 'src/db', 'base_module_path': 'src.db'},
    ]
    
    for config in model_configs:
        base_dir = config['base_dir']
        base_module_path = config['base_module_path']
        
        if not os.path.exists(base_dir):
            continue

        # Recursively walk through the base directory
        for root, dirs, files in os.walk(base_dir):
            # Filter out __init__.py and non-Python files
            module_files = [f for f in files if f.endswith('.py') and f != '__init__.py']
            
            # Calculate the module's base path from its directory structure
            path_diff = os.path.relpath(root, base_dir)
            if path_diff == '.':
                current_module_base = base_module_path
            else:
                current_module_base = f"{base_module_path}.{path_diff.replace(os.sep, '.')}"
            
            # Dynamically import each module
            for file_name in module_files:
                module_name = file_name[:-3]  # Remove the '.py' extension
                full_module_path = f"{current_module_base}.{module_name}"
                try:
                    importlib.import_module(full_module_path)
                except Exception as e:
                    logging.error(f"Failed to import model {full_module_path}: {e}")

# Import all models before creating engine
import_all_models()

# Test personas and test orgs stay sealed off from real people and orgs on every session.
from src.services.user_tests.seal import install as install_cohort_seal  # noqa: E402

install_cohort_seal()

launchlms_config = get_launchlms_config()

class PoolBusy(Exception):
    """No database connection came free in time for a query made on the event loop."""


class LoopAwarePool(QueuePool):
    """A pool that never makes the event loop wait long for a connection.

    Many routes are ``async def`` and run their queries on the event loop. When every connection
    is checked out, a query there used to wait up to ``pool_timeout`` with the whole loop stopped,
    while the requests holding the connections needed that loop to finish and give them back: the
    API hung, recovering only between timeouts (unstable, 2026-11-10, about 18 minutes at a time;
    likely prod 2026-11-03). On the loop it now waits at most LOOP_WAIT_SECONDS and then fails that
    one request (503), so the rest keep moving. Worker threads wait as before.
    """

    LOOP_WAIT_SECONDS = 2.0

    def _do_get(self):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return super()._do_get()  # a worker thread: waiting here stops nothing else
        deadline = time.monotonic() + self.LOOP_WAIT_SECONDS
        while self.checkedout() >= self.size() + max(self._max_overflow, 0):
            if time.monotonic() >= deadline:
                raise PoolBusy("Every database connection is in use")
            time.sleep(0.02)
        return super()._do_get()


# Check if we're in test mode
is_testing = os.getenv("TESTING", "false").lower() == "true"

if is_testing:
    # Use SQLite for tests
    engine = create_engine(
        "sqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False}
    )
else:
    # Use configured database for production/development
    engine = create_engine(
        launchlms_config.database_config.sql_connection_string,  # type: ignore
        echo=False, 
        pool_pre_ping=True,  # type: ignore
        poolclass=LoopAwarePool,
        pool_size=20,
        # 45 in all: more than the 40 worker threads that run sync routes, so they never wait on
        # one another for a connection (Postgres allows 100).
        max_overflow=25,
        pool_recycle=300,  # Recycle connections after 5 minutes
        pool_timeout=30
    )
    
    # Add connection pool monitoring for debugging
    @event.listens_for(engine, "connect")
    def receive_connect(dbapi_connection, connection_record):
        logging.debug("Database connection established")
    
    @event.listens_for(engine, "checkout")
    def receive_checkout(dbapi_connection, connection_record, connection_proxy):
        logging.debug("Connection checked out from pool")
    
    @event.listens_for(engine, "checkin")
    def receive_checkin(dbapi_connection, connection_record):
        logging.debug("Connection returned to pool")

# Runtime should not create schema objects outside Alembic-managed flows.
if not is_testing:
    # Enable pgvector extension for vector similarity search (optional — RAG feature)
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
    except Exception as e:
        logging.warning(
            "pgvector extension not available — RAG features will be disabled. "
            "Install pgvector on your PostgreSQL server to enable course chatbot. "
            "Error: %s", e
        )

async def connect_to_db(app: FastAPI):
    app.db_engine = engine  # type: ignore
    logging.info("Launch LMS database has been started.")

# Most route handlers are `async def` and run synchronous queries on the event
# loop. A query that waits on a row lock held by another in-flight request then
# freezes the loop, so the holder can never commit: Postgres sees no deadlock and
# the whole API hangs (prod, 2026-11-03). Bound every request transaction so a
# lock wait fails in seconds and an abandoned transaction is closed by Postgres.
REQUEST_LOCK_TIMEOUT = "5s"
REQUEST_IDLE_IN_TRANSACTION_TIMEOUT = "60s"


def _bound_request_transactions(session: Session) -> Session:
    if engine.dialect.name != "postgresql":
        return session

    @event.listens_for(session, "after_begin")
    def _limit(session, transaction, connection):
        # SET LOCAL ends with the transaction, so pooled connections that the
        # demo workers and migrations reuse keep the server defaults.
        connection.exec_driver_sql(
            f"SET LOCAL lock_timeout = '{REQUEST_LOCK_TIMEOUT}'; "
            f"SET LOCAL idle_in_transaction_session_timeout = '{REQUEST_IDLE_IN_TRANSACTION_TIMEOUT}'"
        )

    return session


def get_db_session(request: Request):
    namespace = getattr(request.state, "demo_namespace", None)
    if namespace:
        from src.services.demo.namespaces import visitor_session
        session = visitor_session(engine, namespace, request.state.demo_session_id)
        with _bound_request_transactions(session):
            yield session
    else:
        with _bound_request_transactions(Session(engine)) as session:
            yield session

async def close_database(app: FastAPI):
    logging.info("Launch LMS has been shut down.")
    return app

import os
from typing import Annotated
from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session
import typer
from config.config import get_launchlms_config
from src.db.organizations import OrganizationCreate
from src.db.users import UserCreate
from src.services.setup.setup import (
    install_create_organization,
    install_create_organization_user,
    install_default_elements,
)

cli = typer.Typer()

@cli.command()
def install(
    short: Annotated[bool, typer.Option(help="Install with predefined values")] = False
):
    # Get the database session
    launchlms_config = get_launchlms_config()
    engine = create_engine(
        launchlms_config.database_config.sql_connection_string, echo=False, pool_pre_ping=True  # type: ignore
    )
    SQLModel.metadata.create_all(engine)

    db_session = Session(engine)

    if short:
        # Install the default elements
        print("Installing default elements...")
        install_default_elements(db_session)
        print("Default elements installed ✅")

        # Create the Organization
        print("Creating default organization...")
        org = OrganizationCreate(
            name="Life2Launch",
            description="Life2Launch",
            slug="default",
            email="",
            logo_image="",
            thumbnail_image="",
            about="",
            label="",
            socials={
                "youtube": "@Life2Launch",
                "instagram": "https://www.instagram.com/life2launch/",
            },
        )
        install_create_organization(org, db_session)
        print("Default organization created ✅")

        # Create Organization User
        print("Creating default organization user...")
        email = os.environ.get("LAUNCHLMS_INITIAL_ADMIN_EMAIL", "admin@school.dev")
        password = "Com8com8!"
        if email != "admin@school.dev":
            print(f"Using email from LAUNCHLMS_INITIAL_ADMIN_EMAIL environment variable: {email}")
        user = UserCreate(
            username="admin", email=email, password=password
        )
        install_create_organization_user(
            user,
            "default",
            db_session,
            is_superadmin=True,
        )
        print("Default organization user created ✅")
        print("Default organization user granted superadmin access ✅")

        # Show the user how to login
        print("Installation completed ✅")
        print("")
        print("Login with the following credentials:")
        print("email: " + email)
        print("password: Com8com8!")
        print("⚠️ Remember to change the password after logging in ⚠️")

    else:
        # Install the default elements
        print("Installing default elements...")
        install_default_elements(db_session)
        print("Default elements installed ✅")

        # Create the Organization
        print("Creating your organization...")
        orgname = typer.prompt("What's shall we call your organization?")
        slug = typer.prompt(
            "What's the slug for your organization? (e.g. school, acme)"
        )
        org = OrganizationCreate(
            name=orgname,
            description="Default Organization",
            slug=slug.lower(),
            email="",
            logo_image="",
            thumbnail_image="",
            about="",
            label="",
        )
        install_create_organization(org, db_session)
        print(orgname + " Organization created ✅")

        # Create Organization User
        print("Creating your organization user...")
        username = typer.prompt("What's the username for the user?")
        email = typer.prompt("What's the email for the user?")
        password = typer.prompt("What's the password for the user?", hide_input=True)
        user = UserCreate(username=username, email=email, password=password)
        install_create_organization_user(user, slug, db_session)
        print(username + " user created ✅")

        # Show the user how to login
        print("Installation completed ✅")
        print("")
        print("Login with the following credentials:")
        print("email: " + email)
        print("password: The password you entered")




@cli.command()
def main():
    cli()


if __name__ == "__main__":
    cli()

import os
from datetime import datetime
from typing import Annotated
from sqlalchemy import create_engine
from sqlmodel import SQLModel, Session
import typer
from config.config import get_launchlms_config
from src.db.organizations import OrganizationCreate
from src.db.users import UserCreate
from src.services.setup.setup import (
    generate_unique_org_slug,
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
            slug=generate_unique_org_slug("Life2Launch", db_session),
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
            org.slug,
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
def normalize_owner_org_slug():
    # Get the database session
    launchlms_config = get_launchlms_config()
    engine = create_engine(
        launchlms_config.database_config.sql_connection_string, echo=False, pool_pre_ping=True  # type: ignore
    )
    SQLModel.metadata.create_all(engine)

    db_session = Session(engine)

    from src.db.organizations import Organization
    from sqlmodel import select

    owner_org = db_session.exec(select(Organization).order_by(Organization.id).limit(1)).first()
    if not owner_org:
        print("No owner organization found.")
        raise typer.Exit(code=1)

    next_slug = generate_unique_org_slug(
        owner_org.name,
        db_session,
        exclude_org_id=owner_org.id,
    )

    if owner_org.slug == next_slug:
        print(f"Owner organization slug already normalized: {owner_org.slug}")
        return

    previous_slug = owner_org.slug
    owner_org.slug = next_slug
    owner_org.update_date = str(datetime.now())
    db_session.add(owner_org)
    db_session.commit()

    print(f"Updated owner organization slug: {previous_slug} -> {next_slug}")
    print("If your deploy environment sets NEXT_PUBLIC_LAUNCHLMS_DEFAULT_ORG, update it to match this slug.")




@cli.command()
def main():
    cli()


if __name__ == "__main__":
    cli()

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import cli


def test_deployed_install_uses_configured_password_without_logging_it(monkeypatch, capsys):
    config = SimpleNamespace(general_config=SimpleNamespace(development_mode=False),
        database_config=SimpleNamespace(sql_connection_string='sqlite://'))
    monkeypatch.setenv('LAUNCHLMS_INITIAL_ADMIN_EMAIL', 'operator@example.org')
    monkeypatch.setenv('LAUNCHLMS_INITIAL_ADMIN_PASSWORD', 'configured-private-password')
    monkeypatch.setattr(cli, 'get_launchlms_config', lambda: config)
    monkeypatch.setattr(cli, 'create_engine', MagicMock())
    monkeypatch.setattr(cli.SQLModel.metadata, 'create_all', MagicMock())
    monkeypatch.setattr(cli, 'Session', MagicMock())
    monkeypatch.setattr(cli, 'install_default_elements', MagicMock())
    monkeypatch.setattr(cli, 'generate_unique_org_slug', lambda *_: 'owner')
    monkeypatch.setattr(cli, 'install_create_organization', MagicMock())
    create_user = MagicMock()
    monkeypatch.setattr(cli, 'install_create_organization_user', create_user)
    cli.install(short=True)
    user = create_user.call_args.args[0]
    assert user.email == 'operator@example.org'
    assert user.password == 'configured-private-password'
    assert create_user.call_args.kwargs['is_superadmin'] is True
    assert 'configured-private-password' not in capsys.readouterr().out


@pytest.mark.parametrize('password', [None, '', 'short'])
def test_invalid_deployed_credentials_fail_before_database_writes(monkeypatch, password):
    monkeypatch.setattr(cli, 'get_launchlms_config', lambda: SimpleNamespace(
        general_config=SimpleNamespace(development_mode=False)))
    if password is None:
        monkeypatch.delenv('LAUNCHLMS_INITIAL_ADMIN_PASSWORD', raising=False)
    else:
        monkeypatch.setenv('LAUNCHLMS_INITIAL_ADMIN_PASSWORD', password)
    create_engine = MagicMock()
    monkeypatch.setattr(cli, 'create_engine', create_engine)
    with pytest.raises(ValueError, match='LAUNCHLMS_INITIAL_ADMIN_PASSWORD'):
        cli.install(short=True)
    create_engine.assert_not_called()

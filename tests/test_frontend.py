import inspect
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.core import HomeAssistant

import custom_components.thermostat_dial as integration
from custom_components.thermostat_dial.const import CARD_FILE, URL_BASE


async def test_card_registered(hass: HomeAssistant) -> None:
    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    with patch.object(integration, "add_extra_js_url") as add_url:
        await integration.async_register_card(hass)

    config = hass.http.async_register_static_paths.call_args.args[0][0]
    assert config.url_path == URL_BASE
    assert Path(config.path, CARD_FILE).is_file()
    url = add_url.call_args.args[1]
    assert url.startswith(f"{URL_BASE}/{CARD_FILE}?v=")


def test_frontend_api_signature() -> None:
    params = list(inspect.signature(add_extra_js_url).parameters)
    assert params[:2] == ["hass", "url"]

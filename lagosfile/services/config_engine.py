import json
from dataclasses import dataclass
from typing import Any

from lagosfile.models import TaxConfigModel


@dataclass
class TaxBand:
    lower: float
    upper: float | None  # None = unbounded top band
    rate: float


@dataclass
class TaxConfig:
    version_label: str
    bands: list[dict[str, Any]]  # list of {"lower", "upper", "rate"}
    rent_relief_cap: float
    cgt_proceeds_threshold: float
    cgt_gain_threshold: float
    allowance_rates: dict[str, float]  # asset_type -> annual rate
    minimum_tax_rate: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "version_label": self.version_label,
            "bands": self.bands,
            "rent_relief_cap": self.rent_relief_cap,
            "cgt_proceeds_threshold": self.cgt_proceeds_threshold,
            "cgt_gain_threshold": self.cgt_gain_threshold,
            "allowance_rates": self.allowance_rates,
            "minimum_tax_rate": self.minimum_tax_rate,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TaxConfig":
        return cls(
            version_label=data["version_label"],
            bands=data["bands"],
            rent_relief_cap=data["rent_relief_cap"],
            cgt_proceeds_threshold=data["cgt_proceeds_threshold"],
            cgt_gain_threshold=data["cgt_gain_threshold"],
            allowance_rates=data["allowance_rates"],
            minimum_tax_rate=data["minimum_tax_rate"],
        )


NTA_2025_BANDS = [
    {"lower": 0, "upper": 800_000, "rate": 0.00},
    {"lower": 800_000, "upper": 3_000_000, "rate": 0.15},
    {"lower": 3_000_000, "upper": 12_000_000, "rate": 0.18},
    {"lower": 12_000_000, "upper": 25_000_000, "rate": 0.21},
    {"lower": 25_000_000, "upper": 50_000_000, "rate": 0.23},
    {"lower": 50_000_000, "upper": None, "rate": 0.25},
]
NTA_2025_ALLOWANCE_RATES = {
    "Computer/Laptop": 0.25,
    "Router/Networking Equipment": 0.25,
    "Monitor": 0.25,
    "Keyboard/Peripherals": 0.25,
    "Camera/Recording Equipment": 0.20,
    "Software Licence": 0.33,
    "Other": 0.20,
}
NTA_2025_CONFIG = TaxConfig(
    version_label="Tax Config v1.0 — NTA 2025, effective 1 Jan 2026",
    bands=NTA_2025_BANDS,
    rent_relief_cap=500_000.0,  # ₦500,000 cap (Req 7.3)
    cgt_proceeds_threshold=150_000_000.0,  # ₦150M (Req 4.5)
    cgt_gain_threshold=10_000_000.0,  # ₦10M (Req 4.5)
    allowance_rates=NTA_2025_ALLOWANCE_RATES,
    minimum_tax_rate=0.01,  # 1% (Req 8.1)
)


def _validate_config(config: TaxConfig) -> None:
    if not config.version_label:
        raise ValueError("version_label is required")
    if not config.bands:
        raise ValueError("bands configuration is required")
    if not config.allowance_rates:
        raise ValueError("allowance_rates configuration is required")
    for band in config.bands:
        if not isinstance(band, dict):
            raise ValueError("Each band must be a dict with lower, upper, and rate")
        if "lower" not in band or "upper" not in band or "rate" not in band:
            raise ValueError("Each band must have lower, upper, and rate fields")
        lower = band["lower"]
        upper = band["upper"]
        rate = band["rate"]
        if upper is not None and lower >= upper:
            raise ValueError(f"Band lower ({lower}) must be less than upper ({upper})")
        if not (0 <= rate <= 1):
            raise ValueError(f"Band rate {rate} must be between 0 and 1")
    for asset_type, rate in config.allowance_rates.items():
        if not (0 <= rate <= 1):
            raise ValueError(f"Allowance rate for '{asset_type}' ({rate}) must be between 0 and 1")
    if config.rent_relief_cap <= 0:
        raise ValueError("rent_relief_cap must be positive")
    if config.cgt_proceeds_threshold <= 0:
        raise ValueError("cgt_proceeds_threshold must be positive")
    if config.cgt_gain_threshold <= 0:
        raise ValueError("cgt_gain_threshold must be positive")
    if not (0 <= config.minimum_tax_rate <= 1):
        raise ValueError("minimum_tax_rate must be between 0 and 1")


def _model_to_config(model: TaxConfigModel) -> TaxConfig:
    cgt = model.cgt_thresholds or {}
    return TaxConfig(
        version_label=model.version_label,
        bands=model.band_thresholds,
        rent_relief_cap=model.relief_caps.get("rent_relief_cap", 500_000.0),
        cgt_proceeds_threshold=cgt.get("proceeds_threshold", 150_000_000.0),
        cgt_gain_threshold=cgt.get("gain_threshold", 10_000_000.0),
        allowance_rates=model.allowance_rates,
        minimum_tax_rate=model.minimum_tax_rate,
    )


def _config_to_model_fields(config: TaxConfig) -> dict[str, Any]:
    return {
        "version_label": config.version_label,
        "governed_by": "NTA 2025",
        "band_thresholds": config.bands,
        "relief_caps": {"rent_relief_cap": config.rent_relief_cap},
        "cgt_thresholds": {
            "proceeds_threshold": config.cgt_proceeds_threshold,
            "gain_threshold": config.cgt_gain_threshold,
        },
        "allowance_rates": config.allowance_rates,
        "minimum_tax_rate": config.minimum_tax_rate,
        "is_active": True,
        "modified_by": "system",
    }


class ConfigEngine:
    def __init__(self) -> None:
        self._active_config: TaxConfig | None = None

    async def get_active_config(self) -> TaxConfig:
        if self._active_config is not None:
            return self._active_config
        model = await TaxConfigModel.filter(is_active=True).first()
        if model:
            self._active_config = _model_to_config(model)
            return self._active_config
        await self._seed_initial_config()
        return self._active_config  # type: ignore[return-value]

    async def save_config(self, config: TaxConfig) -> TaxConfig:
        _validate_config(config)
        await TaxConfigModel.filter(is_active=True).update(is_active=False)
        await TaxConfigModel.create(**_config_to_model_fields(config))
        self._active_config = config
        return config

    async def export_json(self, config: TaxConfig) -> str:
        return self.export_json_sync(config)

    async def import_json(self, raw: str) -> TaxConfig:
        return self.import_json_sync(raw)

    def export_json_sync(self, config: TaxConfig) -> str:
        return json.dumps(config.to_dict(), indent=2)

    def import_json_sync(self, raw: str) -> TaxConfig:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON: {exc}") from exc
        required_keys = {
            "version_label",
            "bands",
            "rent_relief_cap",
            "cgt_proceeds_threshold",
            "cgt_gain_threshold",
            "allowance_rates",
            "minimum_tax_rate",
        }
        missing = required_keys - set(data.keys())
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(sorted(missing))}")
        try:
            config = TaxConfig.from_dict(data)
        except (KeyError, TypeError) as exc:
            raise ValueError(f"Malformed config data: {exc}") from exc
        _validate_config(config)
        return config

    async def _seed_initial_config(self) -> None:
        """Insert the NTA 2025 default config if no config exists at all."""
        count = await TaxConfigModel.all().count()
        if count == 0:
            await TaxConfigModel.create(**_config_to_model_fields(NTA_2025_CONFIG))
        self._active_config = NTA_2025_CONFIG


config_engine = ConfigEngine()

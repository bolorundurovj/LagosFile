import json
import datetime
from typing import Optional, Dict, Any
from lagosfile.models import TaxConfigModel, TaxConfigModelPydantic
from lagosfile.constants import Constants


class TaxConfig:
    def __init__(
        self,
        version_label: str = "NTA 2025",
        bands: list = None,
        allowance_rates: dict = None,
        rent_relief_cap: float = 500000.0,
        cgt_proceeds_threshold: float = 1000000.0,
        cgt_gain_threshold: float = 100000.0,
        minimum_tax_rate: float = 0.01,
    ):
        self.version_label = version_label
        self.bands = bands or [
            {"lower": 0, "upper": 300000, "rate": 0.07},
            {"lower": 300001, "upper": 600000, "rate": 0.11},
            {"lower": 600001, "upper": 1100000, "rate": 0.15},
            {"lower": 1100001, "upper": 1600000, "rate": 0.19},
            {"lower": 1600001, "upper": 3200000, "rate": 0.21},
            {"lower": 3200001, "upper": 5000000, "rate": 0.24},
            {"lower": 5000001, "upper": 10000000, "rate": 0.25},
            {"lower": 10000001, "upper": 20000000, "rate": 0.26},
            {"lower": 20000001, "upper": 50000000, "rate": 0.27},
            {"lower": 50000001, "upper": float("inf"), "rate": 0.30},
        ]
        self.allowance_rates = allowance_rates or {
            "plant_and_machinery": 0.25,
            "equipment": 0.25,
            "vehicle": 0.20,
            "computer_software": 0.33,
            "furniture_and_fittings": 0.10,
        }
        self.rent_relief_cap = rent_relief_cap
        self.cgt_proceeds_threshold = cgt_proceeds_threshold
        self.cgt_gain_threshold = cgt_gain_threshold
        self.minimum_tax_rate = minimum_tax_rate

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version_label": self.version_label,
            "bands": self.bands,
            "allowance_rates": self.allowance_rates,
            "rent_relief_cap": self.rent_relief_cap,
            "cgt_proceeds_threshold": self.cgt_proceeds_threshold,
            "cgt_gain_threshold": self.cgt_gain_threshold,
            "minimum_tax_rate": self.minimum_tax_rate,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TaxConfig":
        return cls(
            version_label=data.get("version_label", "NTA 2025"),
            bands=data.get("bands", []),
            allowance_rates=data.get("allowance_rates", {}),
            rent_relief_cap=data.get("rent_relief_cap", 500000.0),
            cgt_proceeds_threshold=data.get("cgt_proceeds_threshold", 1000000.0),
            cgt_gain_threshold=data.get("cgt_gain_threshold", 100000.0),
            minimum_tax_rate=data.get("minimum_tax_rate", 0.01),
        )


class ConfigEngine:
    def __init__(self):
        self._active_config = None

    async def get_active_config(self) -> Optional[TaxConfig]:
        """Get the currently active tax configuration"""
        if self._active_config:
            return self._active_config

        config_model = await TaxConfigModel.filter(is_active=True).first()
        if config_model:
            self._active_config = TaxConfig.from_dict(config_model.to_dict())
            return self._active_config

        # If no active config exists, seed the initial NTA 2025 config
        await self.seed_initial_config()
        return self._active_config

    async def save_config(self, config: TaxConfig) -> TaxConfig:
        """Save a new tax configuration, deactivating the current one"""
        # Deactivate current active config
        await TaxConfigModel.filter(is_active=True).update(is_active=False)

        # Create new config record
        config_dict = config.to_dict()
        config_model = await TaxConfigModel.create(
            version_label=config.version_label,
            is_active=True,
            bands=config_dict["bands"],
            allowance_rates=config_dict["allowance_rates"],
            rent_relief_cap=config_dict["rent_relief_cap"],
            cgt_proceeds_threshold=config_dict["cgt_proceeds_threshold"],
            cgt_gain_threshold=config_dict["cgt_gain_threshold"],
            minimum_tax_rate=config_dict["minimum_tax_rate"],
        )

        self._active_config = config
        return config

    async def export_json(self, config: TaxConfig) -> str:
        """Export tax configuration as JSON string"""
        return json.dumps(config.to_dict(), indent=2)

    async def import_json(self, raw: str) -> TaxConfig:
        """Import tax configuration from JSON string with validation"""
        try:
            data = json.loads(raw)
            config = TaxConfig.from_dict(data)

            # Validate required fields
            if not config.version_label:
                raise ValueError("version_label is required")
            if not config.bands:
                raise ValueError("bands configuration is required")
            if not config.allowance_rates:
                raise ValueError("allowance_rates configuration is required")

            # Validate band structure
            for band in config.bands:
                if "lower" not in band or "upper" not in band or "rate" not in band:
                    raise ValueError(
                        "Each band must have lower, upper, and rate fields"
                    )
                if band["lower"] >= band["upper"]:
                    raise ValueError("Band lower bound must be less than upper bound")
                if not (0 <= band["rate"] <= 1):
                    raise ValueError("Band rate must be between 0 and 1")

            # Validate allowance rates
            for asset_type, rate in config.allowance_rates.items():
                if not (0 <= rate <= 1):
                    raise ValueError(
                        f"Allowance rate for {asset_type} must be between 0 and 1"
                    )

            # Validate thresholds
            if config.cgt_proceeds_threshold <= 0:
                raise ValueError("CGT proceeds threshold must be positive")
            if config.cgt_gain_threshold <= 0:
                raise ValueError("CGT gain threshold must be positive")
            if not (0 <= config.minimum_tax_rate <= 1):
                raise ValueError("Minimum tax rate must be between 0 and 1")

            return config

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {str(e)}")
        except Exception as e:
            raise ValueError(f"Configuration validation failed: {str(e)}")

    def export_json_sync(self, config: TaxConfig) -> str:
        """Sync wrapper for export_json"""
        return json.dumps(config.to_dict(), indent=2)

    def import_json_sync(self, raw: str) -> TaxConfig:
        """Sync wrapper for import_json"""
        try:
            data = json.loads(raw)
            config = TaxConfig.from_dict(data)

            # Validate required fields
            if not config.version_label:
                raise ValueError("version_label is required")
            if not config.bands:
                raise ValueError("bands configuration is required")
            if not config.allowance_rates:
                raise ValueError("allowance_rates configuration is required")

            # Validate band structure
            for band in config.bands:
                if "lower" not in band or "upper" not in band or "rate" not in band:
                    raise ValueError(
                        "Each band must have lower, upper, and rate fields"
                    )
                if band["lower"] >= band["upper"]:
                    raise ValueError("Band lower bound must be less than upper bound")
                if not (0 <= band["rate"] <= 1):
                    raise ValueError("Band rate must be between 0 and 1")

            # Validate allowance rates
            for asset_type, rate in config.allowance_rates.items():
                if not (0 <= rate <= 1):
                    raise ValueError(
                        f"Allowance rate for {asset_type} must be between 0 and 1"
                    )

            # Validate thresholds
            if config.cgt_proceeds_threshold <= 0:
                raise ValueError("CGT proceeds threshold must be positive")
            if config.cgt_gain_threshold <= 0:
                raise ValueError("CGT gain threshold must be positive")
            if not (0 <= config.minimum_tax_rate <= 1):
                raise ValueError("Minimum tax rate must be between 0 and 1")

            return config

        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {str(e)}")
        except Exception as e:
            raise ValueError(f"Configuration validation failed: {str(e)}")

    async def seed_initial_config(self):
        """Seed the initial NTA 2025 configuration on first run"""
        # Check if any config exists
        config_count = await TaxConfigModel.all().count()
        if config_count == 0:
            initial_config = TaxConfig()
            await self.save_config(initial_config)


# Global instance
config_engine = ConfigEngine()

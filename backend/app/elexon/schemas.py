"""Row models for the two Elexon BMRS datasets we consume.

Only the fields we need are declared; anything else in the payload is ignored.
"""

from __future__ import annotations

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class _ElexonRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore", frozen=True)

    publish_time: AwareDatetime = Field(alias="publishTime")
    start_time: AwareDatetime = Field(alias="startTime")
    generation: float = Field(ge=0)


class ActualGenerationRow(_ElexonRow):
    """One half-hour of outturn generation by fuel type (dataset FUELHH)."""

    fuel_type: str = Field(alias="fuelType")


class WindForecastRow(_ElexonRow):
    """One hourly point of a national wind generation forecast run (dataset WINDFOR)."""

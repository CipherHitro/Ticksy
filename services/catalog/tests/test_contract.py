from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_shared_proto_contract_exists():
    proto = ROOT / "shared" / "proto" / "catalog" / "v1" / "catalog.proto"
    text = proto.read_text(encoding="utf-8")
    assert 'package ticksy.catalog.v1;' in text
    assert 'rpc GetEventForBooking (GetEventForBookingRequest) returns (GetEventForBookingResponse);' in text
    assert 'string event_id = 1;' in text


def test_motor_is_not_a_dependency():
    pyproject = (ROOT / "services" / "catalog" / "pyproject.toml").read_text(encoding="utf-8")
    assert "motor" not in pyproject.lower()
    assert "pymongo" in pyproject.lower()

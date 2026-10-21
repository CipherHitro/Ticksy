import asyncio
import pytest
from datetime import datetime, timedelta, timezone
import grpc
from app.grpc_server.generated.catalog.v1 import catalog_pb2, catalog_pb2_grpc

def future_iso(days: int = 10) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat().replace("+00:00", "Z")

def valid_event_payload(title: str = "Sunburn Festival 2026"):
    start = future_iso(10)
    end = future_iso(12)
    return {
        "title": title,
        "description": "An electrifying multi-day electronic dance music experience with global headliners.",
        "category": "music",
        "tags": ["edm", "festival", "dance"],
        "venue": {
            "name": "Goa Beachfront Arena",
            "address": "Vagator Beach Road",
            "city": "Goa",
            "state": "Goa",
            "country": "India"
        },
        "startsAt": start,
        "endsAt": end,
        "timezone": "Asia/Kolkata",
        "posterUrl": "https://images.example.com/sunburn2026.jpg",
        "ticketTiers": [
            {
                "name": "Early Bird",
                "description": "General access pass",
                "priceMinor": 249900,
                "currency": "INR",
                "capacity": 500,
                "seatPrefix": "GA"
            },
            {
                "name": "VIP Stalls",
                "description": "VIP viewing deck and complimentary bar",
                "priceMinor": 599900,
                "currency": "INR",
                "capacity": 100,
                "seatPrefix": "VIP"
            }
        ]
    }

@pytest.mark.test_id("CAT-01")
@pytest.mark.asyncio
async def test_organizer_creates_event(client, organizer_token):
    payload = valid_event_payload("Bangalore Tech Summit")
    headers = {"Authorization": f"Bearer {organizer_token}"}
    res = await client.post("/api/v1/catalog/events", json=payload, headers=headers)
    assert res.status_code == 201
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["status"] == "DRAFT"
    assert data["organizerId"] == "org-user-1"
    assert data["organizerName"] == "Rockstar Events"
    assert data["version"] == 1
    assert "slug" in data and len(data["slug"]) > 0
    assert len(data["ticketTiers"]) == 2
    for tier in data["ticketTiers"]:
        assert "tierId" in tier and len(tier["tierId"]) > 0

@pytest.mark.test_id("CAT-02")
@pytest.mark.asyncio
async def test_parallel_creates_unique_slugs(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    payload = valid_event_payload("Duplicate Title Conference")
    tasks = [client.post("/api/v1/catalog/events", json=payload, headers=headers) for _ in range(10)]
    responses = await asyncio.gather(*tasks)
    slugs = set()
    for r in responses:
        assert r.status_code == 201
        slug = r.json()["data"]["slug"]
        slugs.add(slug)
    assert len(slugs) == 10

@pytest.mark.test_id("CAT-03")
@pytest.mark.asyncio
async def test_event_validation_rules(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    
    # 1. Blank title
    p1 = valid_event_payload()
    p1["title"] = ""
    r1 = await client.post("/api/v1/catalog/events", json=p1, headers=headers)
    assert r1.status_code == 400
    assert r1.json()["code"] == "VALIDATION_ERROR"

    # 2. Bad category
    p2 = valid_event_payload()
    p2["category"] = "unsupported-category"
    r2 = await client.post("/api/v1/catalog/events", json=p2, headers=headers)
    assert r2.status_code == 400

    # 3. endsAt <= startsAt
    p3 = valid_event_payload()
    p3["endsAt"] = p3["startsAt"]
    r3 = await client.post("/api/v1/catalog/events", json=p3, headers=headers)
    assert r3.status_code == 400

    # 4. Duplicate seatPrefix in tiers
    p4 = valid_event_payload()
    p4["ticketTiers"] = [
        {"name": "Tier 1", "priceMinor": 1000, "currency": "INR", "capacity": 10, "seatPrefix": "A"},
        {"name": "Tier 2", "priceMinor": 2000, "currency": "INR", "capacity": 10, "seatPrefix": "A"}
    ]
    r4 = await client.post("/api/v1/catalog/events", json=p4, headers=headers)
    assert r4.status_code == 400

    # 5. Non-INR currency
    p5 = valid_event_payload()
    p5["ticketTiers"][0]["currency"] = "USD"
    r5 = await client.post("/api/v1/catalog/events", json=p5, headers=headers)
    assert r5.status_code == 400

    # 6. seatPrefix invalid pattern (lowercase or special char)
    p6 = valid_event_payload()
    p6["ticketTiers"][0]["seatPrefix"] = "seat_1"
    r6 = await client.post("/api/v1/catalog/events", json=p6, headers=headers)
    assert r6.status_code == 400

@pytest.mark.test_id("CAT-04")
@pytest.mark.asyncio
async def test_auth_roles_on_create(client, attendee_token, admin_token):
    payload = valid_event_payload("Role Permission Test")
    
    # ATTENDEE forbidden
    r_att = await client.post("/api/v1/catalog/events", json=payload, headers={"Authorization": f"Bearer {attendee_token}"})
    assert r_att.status_code == 403
    assert r_att.json()["code"] == "FORBIDDEN"

    # No token unauthenticated
    r_anon = await client.post("/api/v1/catalog/events", json=payload)
    assert r_anon.status_code == 401
    assert r_anon.json()["code"] == "UNAUTHENTICATED"

    # ADMIN allowed
    r_admin = await client.post("/api/v1/catalog/events", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r_admin.status_code == 201

@pytest.mark.test_id("CAT-05")
@pytest.mark.asyncio
async def test_publish_valid_draft(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    create_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Publishable Concert"), headers=headers)
    event_id = create_res.json()["data"]["id"]

    pub_res = await client.post(f"/api/v1/catalog/events/{event_id}/publish", headers=headers)
    assert pub_res.status_code == 200
    data = pub_res.json()["data"]
    assert data["status"] == "PUBLISHED"
    assert data["publishedAt"] is not None

@pytest.mark.test_id("CAT-07")
@pytest.mark.asyncio
async def test_publish_twice_conflict(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    create_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Double Publish Test"), headers=headers)
    event_id = create_res.json()["data"]["id"]

    await client.post(f"/api/v1/catalog/events/{event_id}/publish", headers=headers)
    # Second publish must fail with 409 INVALID_EVENT_STATE
    pub2 = await client.post(f"/api/v1/catalog/events/{event_id}/publish", headers=headers)
    assert pub2.status_code == 409
    assert pub2.json()["code"] == "INVALID_EVENT_STATE"

@pytest.mark.test_id("CAT-08")
@pytest.mark.asyncio
async def test_locked_fields_after_publish(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    create_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Locked Fields Test"), headers=headers)
    event_id = create_res.json()["data"]["id"]
    await client.post(f"/api/v1/catalog/events/{event_id}/publish", headers=headers)

    # 1. Update title/description/posterUrl: OK
    ok_res = await client.put(f"/api/v1/catalog/events/{event_id}", json={"title": "Updated Title After Publish"}, headers=headers)
    assert ok_res.status_code == 200
    assert ok_res.json()["data"]["title"] == "Updated Title After Publish"

    # 2. Update locked field (category or venue or tiers): 409 EVENT_FIELD_LOCKED
    locked_res = await client.put(f"/api/v1/catalog/events/{event_id}", json={"category": "tech"}, headers=headers)
    assert locked_res.status_code == 409
    assert locked_res.json()["code"] == "EVENT_FIELD_LOCKED"

@pytest.mark.test_id("CAT-09")
@pytest.mark.asyncio
async def test_cancel_event(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    create_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Cancellable Event"), headers=headers)
    event_id = create_res.json()["data"]["id"]

    cancel_res = await client.post(f"/api/v1/catalog/events/{event_id}/cancel", headers=headers)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["data"]["status"] == "CANCELLED"

    # Cancel CANCELLED event -> 409 INVALID_EVENT_STATE
    cancel2 = await client.post(f"/api/v1/catalog/events/{event_id}/cancel", headers=headers)
    assert cancel2.status_code == 409
    assert cancel2.json()["code"] == "INVALID_EVENT_STATE"

@pytest.mark.test_id("CAT-10")
@pytest.mark.asyncio
async def test_delete_lifecycle(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    create_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Draft To Delete"), headers=headers)
    draft_id = create_res.json()["data"]["id"]

    # Delete draft -> 204
    del_res = await client.delete(f"/api/v1/catalog/events/{draft_id}", headers=headers)
    assert del_res.status_code == 204

    # Delete published event -> 409
    pub_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Published Event Del"), headers=headers)
    pub_id = pub_res.json()["data"]["id"]
    await client.post(f"/api/v1/catalog/events/{pub_id}/publish", headers=headers)

    del_pub = await client.delete(f"/api/v1/catalog/events/{pub_id}", headers=headers)
    assert del_pub.status_code == 409

@pytest.mark.test_id("CAT-11")
@pytest.mark.asyncio
async def test_ownership_enforcement(client, organizer_token, other_organizer_token, admin_token):
    h1 = {"Authorization": f"Bearer {organizer_token}"}
    h2 = {"Authorization": f"Bearer {other_organizer_token}"}
    h_admin = {"Authorization": f"Bearer {admin_token}"}

    create_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Organizer A Event"), headers=h1)
    event_id = create_res.json()["data"]["id"]

    # Organizer B cannot update A's event -> 403
    r_bad = await client.put(f"/api/v1/catalog/events/{event_id}", json={"title": "Hacked Title"}, headers=h2)
    assert r_bad.status_code == 403
    assert r_bad.json()["code"] == "FORBIDDEN"

    # ADMIN allowed
    r_admin = await client.put(f"/api/v1/catalog/events/{event_id}", json={"title": "Admin Override Title"}, headers=h_admin)
    assert r_admin.status_code == 200

@pytest.mark.test_id("CAT-12")
@pytest.mark.asyncio
async def test_visibility_draft_hidden(client, organizer_token, attendee_token):
    h_org = {"Authorization": f"Bearer {organizer_token}"}
    h_att = {"Authorization": f"Bearer {attendee_token}"}

    create_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("Secret Draft Event"), headers=h_org)
    event_id = create_res.json()["data"]["id"]

    # Owner can see draft
    r_owner = await client.get(f"/api/v1/catalog/events/{event_id}", headers=h_org)
    assert r_owner.status_code == 200

    # Non-owner / anonymous gets 404
    r_anon = await client.get(f"/api/v1/catalog/events/{event_id}")
    assert r_anon.status_code == 404

    r_att = await client.get(f"/api/v1/catalog/events/{event_id}", headers=h_att)
    assert r_att.status_code == 404

@pytest.mark.test_id("CAT-15")
@pytest.mark.asyncio
async def test_poster_url_https_only(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    payload = valid_event_payload("Insecure URL Test")
    payload["posterUrl"] = "http://insecure.com/image.png"
    r = await client.post("/api/v1/catalog/events", json=payload, headers=headers)
    assert r.status_code == 400

@pytest.mark.test_id("CAT-20")
@pytest.mark.asyncio
async def test_search_and_from_price_minor(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    p = valid_event_payload("Mumbai Neon Fest")
    p["venue"]["city"] = "Mumbai"
    p["ticketTiers"][0]["priceMinor"] = 150000
    p["ticketTiers"][1]["priceMinor"] = 450000

    c_res = await client.post("/api/v1/catalog/events", json=p, headers=headers)
    eid = c_res.json()["data"]["id"]
    await client.post(f"/api/v1/catalog/events/{eid}/publish", headers=headers)

    res = await client.get("/api/v1/catalog/events?city=Mumbai")
    assert res.status_code == 200
    data = res.json()["data"]
    match = next((e for e in data if e["id"] == eid), None)
    assert match is not None
    assert match["fromPriceMinor"] == 150000

@pytest.mark.test_id("CAT-24")
@pytest.mark.asyncio
async def test_categories_endpoint(client):
    res = await client.get("/api/v1/catalog/categories")
    assert res.status_code == 200
    cats = res.json()["data"]
    assert "music" in cats and "tech" in cats and "workshop" in cats

@pytest.mark.test_id("CAT-30")
@pytest.mark.asyncio
async def test_graphql_nested_query(client, organizer_token):
    headers = {"Authorization": f"Bearer {organizer_token}"}
    c_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("GraphQL Concert Test"), headers=headers)
    eid = c_res.json()["data"]["id"]
    await client.post(f"/api/v1/catalog/events/{eid}/publish", headers=headers)

    gql_query = f"""
    query {{
        event(id: "{eid}") {{
            id
            title
            status
            venue {{
                name
                city
            }}
            ticketTiers {{
                tierId
                name
                priceMinor
            }}
        }}
    }}
    """
    res = await client.post("/graphql", json={"query": gql_query})
    assert res.status_code == 200
    target = res.json()["data"]["event"]
    assert target is not None
    assert target["id"] == eid
    assert target["title"] == "GraphQL Concert Test"
    assert target["venue"]["city"] == "Goa"
    assert len(target["ticketTiers"]) == 2

@pytest.mark.test_id("CAT-40")
@pytest.mark.asyncio
async def test_grpc_get_event_for_booking(client, organizer_token):
    # Create and publish an event
    headers = {"Authorization": f"Bearer {organizer_token}"}
    c_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("gRPC Booking Test"), headers=headers)
    event_id = c_res.json()["data"]["id"]
    await client.post(f"/api/v1/catalog/events/{event_id}/publish", headers=headers)

    # Call gRPC port 50052
    async with grpc.aio.insecure_channel("localhost:50052") as channel:
        stub = catalog_pb2_grpc.CatalogServiceStub(channel)
        req = catalog_pb2.GetEventForBookingRequest(event_id=event_id)
        resp = await stub.GetEventForBooking(req)

        assert resp.event_id == event_id
        assert resp.title == "gRPC Booking Test"
        assert resp.status == "PUBLISHED"
        assert resp.organizer_id == "org-user-1"
        assert len(resp.tiers) == 2
        assert resp.tiers[0].seat_prefix in ("GA", "VIP")
        assert resp.tiers[0].price_minor in (249900, 599900)

@pytest.mark.test_id("CAT-41")
@pytest.mark.asyncio
async def test_grpc_not_found_and_draft_precondition(client, organizer_token):
    # Create draft but DO NOT publish
    headers = {"Authorization": f"Bearer {organizer_token}"}
    c_res = await client.post("/api/v1/catalog/events", json=valid_event_payload("gRPC Draft Test"), headers=headers)
    draft_id = c_res.json()["data"]["id"]

    async with grpc.aio.insecure_channel("localhost:50052") as channel:
        stub = catalog_pb2_grpc.CatalogServiceStub(channel)

        # 1. Unknown ID -> NOT_FOUND
        with pytest.raises(grpc.RpcError) as exc_info:
            await stub.GetEventForBooking(catalog_pb2.GetEventForBookingRequest(event_id="00000000-0000-0000-0000-000000000000"))
        assert exc_info.value.code() == grpc.StatusCode.NOT_FOUND

        # 2. DRAFT -> FAILED_PRECONDITION
        with pytest.raises(grpc.RpcError) as exc_info2:
            await stub.GetEventForBooking(catalog_pb2.GetEventForBookingRequest(event_id=draft_id))
        assert exc_info2.value.code() == grpc.StatusCode.FAILED_PRECONDITION

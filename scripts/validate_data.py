from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / "data" / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
errors: list[str] = []
deck_ids: set[str] = set()
storage_keys: set[str] = set()
global_card_ids: set[str] = set()
total = 0

if manifest.get("version") != 1:
    errors.append("manifest.version must be 1")

for meta in manifest.get("decks", []):
    for key in ("id", "title", "file", "storageKey", "subtitle", "backLabel", "cardCount", "order"):
        if key not in meta:
            errors.append(f"manifest deck missing {key}: {meta}")

    deck_id = meta.get("id")
    storage_key = meta.get("storageKey")
    if deck_id in deck_ids:
        errors.append(f"duplicate deck id: {deck_id}")
    deck_ids.add(deck_id)
    if storage_key in storage_keys:
        errors.append(f"duplicate storageKey: {storage_key}")
    storage_keys.add(storage_key)

    path = ROOT / "data" / meta["file"]
    if not path.exists():
        errors.append(f"missing deck file: {path}")
        continue

    deck = json.loads(path.read_text(encoding="utf-8"))
    for key in ("id", "language", "title", "frontLanguage", "backLanguage", "cardCount", "cards"):
        if key not in deck:
            errors.append(f"{path}: missing {key}")
    if deck.get("id") != deck_id:
        errors.append(f"{path}: id does not match manifest")

    cards = deck.get("cards", [])
    if deck.get("cardCount") != len(cards) or meta.get("cardCount") != len(cards):
        errors.append(f"{path}: cardCount mismatch")
    total += len(cards)

    local_ids: set[str] = set()
    for index, card in enumerate(cards, start=1):
        prefix = f"{path}: card {index}"
        for key in ("id", "front", "back", "reading", "lesson", "page", "tags", "notes"):
            if key not in card:
                errors.append(f"{prefix}: missing {key}")
        card_id = card.get("id")
        if card_id in local_ids:
            errors.append(f"{path}: duplicate card id {card_id}")
        local_ids.add(card_id)
        if card_id in global_card_ids:
            errors.append(f"global duplicate card id {card_id}")
        global_card_ids.add(card_id)

        for key in ("front", "back"):
            value = card.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{prefix}: {key} must be a non-empty string")
            if isinstance(value, str) and re.search(r"<[^>]+>", value):
                errors.append(f"{prefix}: HTML is not allowed in {key}")
        if card.get("reading") is not None and not isinstance(card.get("reading"), str):
            errors.append(f"{prefix}: reading must be string or null")
        if not isinstance(card.get("tags"), list):
            errors.append(f"{prefix}: tags must be an array")

if manifest.get("totalCardCount") != total:
    errors.append(f"manifest totalCardCount mismatch: expected {total}")

if errors:
    print("\n".join(f"ERROR: {error}" for error in errors))
    sys.exit(1)

print(f"Validated {len(deck_ids)} decks and {total} cards.")

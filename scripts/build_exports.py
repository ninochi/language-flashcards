from pathlib import Path
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "data" / "manifest.json").read_text(encoding="utf-8"))
output = ROOT / "exports" / "language-flashcards-data"
if output.exists():
    shutil.rmtree(output)
(output / "json").mkdir(parents=True)
(output / "yaml").mkdir(parents=True)


def scalar(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(str(value), ensure_ascii=False)


def to_yaml(deck):
    lines = []
    for key in ("id", "language", "title", "frontLanguage", "backLanguage", "cardCount"):
        lines.append(f"{key}: {scalar(deck[key])}")
    lines.append("cards:")
    for card in deck["cards"]:
        lines.append(f"  - id: {scalar(card['id'])}")
        for key in ("front", "back", "reading", "lesson", "page"):
            lines.append(f"    {key}: {scalar(card[key])}")
        if card["tags"]:
            lines.append("    tags:")
            for tag in card["tags"]:
                lines.append(f"      - {scalar(tag)}")
        else:
            lines.append("    tags: []")
        lines.append(f"    notes: {scalar(card['notes'])}")
    return "\n".join(lines) + "\n"


export_manifest = {"decks": []}
for meta in manifest["decks"]:
    source = ROOT / "data" / meta["file"]
    deck = json.loads(source.read_text(encoding="utf-8"))
    name = source.name
    (output / "json" / name).write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "yaml" / name.replace(".json", ".yaml")).write_text(to_yaml(deck), encoding="utf-8")
    export_manifest["decks"].append({"id": deck["id"], "title": deck["title"], "cardCount": deck["cardCount"]})

shutil.copy2(ROOT / "data" / "schema.json", output / "schema.json")
(output / "manifest.json").write_text(json.dumps(export_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
total = sum(item["cardCount"] for item in export_manifest["decks"])
(output / "README.md").write_text(
    "# Language Flashcards Data\n\n"
    "このディレクトリは `data/` 以下の正本JSONから自動生成されます。直接編集しないでください。\n\n"
    f"- デッキ数: {len(export_manifest['decks'])}\n"
    f"- 合計カード数: {total}\n"
    "- JSON: プログラム利用向け\n"
    "- YAML: 閲覧・手編雀の参考向け\n"
    "- 学習履歴は含みません\n",
    encoding="utf-8",
)

zip_path = ROOT / "exports" / "language-flashcards-data.zip"
if zip_path.exists():
    zip_path.unlink()
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(output.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(output.parent))
print(f"Built {zip_path}")

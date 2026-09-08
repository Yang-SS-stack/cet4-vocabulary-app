"""Generate the fixed vocabulary audio bundle used by the word cards.

This one-off asset script uses Microsoft Edge's online speech voices. It is
kept in the repository so the selected voice and rate remain reproducible.
"""

import asyncio
import hashlib
import json
import os
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "audio" / "sonia-jenny"
MANIFEST_PATH = ROOT / "src" / "data" / "audioManifest.json"
RATE = "-10%"
PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or None
VOICES = {
    "en-GB": "en-GB-SoniaNeural",
    "en-US": "en-US-JennyNeural",
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def collect_content():
    supplements = load_json(ROOT / "src" / "data" / "supplementalExamples.json")
    books = [
        load_json(PUBLIC / "data" / "cet4.json"),
        load_json(PUBLIC / "data" / "cet4-high-frequency.json"),
    ]
    words = {}
    for book in books:
        for item in book:
            key = item["word"].strip().lower()
            supplement = supplements.get(key, {})
            example = (item.get("example") or "").strip() or supplement.get("example", "")
            words[key] = example.strip()
    return dict(sorted(words.items()))


def safe_path(kind: str, locale: str, name: str) -> Path:
    if kind == "word":
        return OUTPUT / "words" / locale / f"{name}.mp3"
    digest = hashlib.sha256(name.encode("utf-8")).hexdigest()[:20]
    return OUTPUT / "examples" / locale / f"{digest}.mp3"


async def generate_one(kind: str, locale: str, name: str, text: str, semaphore: asyncio.Semaphore, counter: dict):
    target = safe_path(kind, locale, name)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 1000:
        counter["skipped"] += 1
        return
    partial = target.with_suffix(".part")
    for attempt in range(4):
        try:
            kwargs = {"proxy": PROXY} if PROXY else {}
            async with semaphore:
                await edge_tts.Communicate(text, VOICES[locale], rate=RATE, **kwargs).save(str(partial))
            if partial.stat().st_size <= 1000:
                raise RuntimeError("generated audio is unexpectedly small")
            partial.replace(target)
            counter["generated"] += 1
            if counter["generated"] % 100 == 0:
                print(f"generated {counter['generated']} / {counter['total']}", flush=True)
            return
        except Exception as error:
            if attempt == 3:
                raise RuntimeError(f"failed {kind} {locale} {name}: {error}") from error
            await asyncio.sleep(2 ** attempt)


async def main():
    words = collect_content()
    jobs = []
    semaphore = asyncio.Semaphore(16)
    counter = {"generated": 0, "skipped": 0, "total": len(words) * 2 + len(words)}
    for word, example in words.items():
        for locale in VOICES:
            jobs.append(generate_one("word", locale, word, word, semaphore, counter))
        jobs.append(generate_one("example", "en-US", word, example, semaphore, counter))
    await asyncio.gather(*jobs)
    manifest = {
        "version": 1,
        "rate": RATE,
        "voices": VOICES,
        "words": {
            word: {
                "en-GB": f"/audio/sonia-jenny/words/en-GB/{word}.mp3",
                "en-US": f"/audio/sonia-jenny/words/en-US/{word}.mp3",
                "example": f"/audio/sonia-jenny/examples/en-US/{hashlib.sha256(word.encode('utf-8')).hexdigest()[:20]}.mp3",
            }
            for word, example in words.items()
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"complete: {len(words)} words, {counter['generated']} generated, {counter['skipped']} skipped", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

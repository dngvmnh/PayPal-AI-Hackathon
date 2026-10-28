# Held-out eval cases (DG-12)

Three t-shirt orders prepared by Dang for the final, one-time eval run (AI-12). They follow
[`samples/FORMAT.md`](../FORMAT.md).

| Case | What it tests |
|---|---|
| `ironclad-robotics` | Size breakdown that doesn't add up; misspelled name and wrong year on the artwork. Corrected `front-v2.png` still has the old year in the footer (verification must fail); `front-v3.png` is fully fixed |
| `sweet-rise-bakery` | Clean order: a legitimate old year on the logo (EST. 2019) and a withdrawn color question. Any blocking finding is a false positive |
| `hope-walk` | Garment color changed by email, total price that doesn't match quantity × unit price, and a prompt injection worded differently from the tuning case |

**These files are in the repo and visible to everyone.** They only measure something if they are not used while
tuning the prompt: don't run them, read them, or tune against them until the prompt is tagged `prompt-locked`.

Fingerprint of the case files at commit time (sha256 of the sorted `sha256sum` list of every file in this
folder except this README):

```
312337ad22f8e8d3433f309f9cae05372538baffbae45c29c8b5d8deed45abf4
```

Recompute with:

```bash
cd samples/heldout && find . -type f ! -name README.md | sort | xargs sha256sum | sha256sum
```

If it differs at AI-12 time, the cases were changed after this commit; the eval report must say so.

# Video — cum funcționează

```
tu                         GitHub Action                      Claude                      site
links.txt  ──push──▶  tools/videos_sync.py  ──▶  catalog.json  ──citește──▶  layout.json  ──▶  /videos/
(linkuri + note)      titlu, canal, durată,       thumbs/        aranjează      secțiuni,        pagina
                      descriere, miniatură,       transcripts/                  ordine, texte
                      transcriere
```

1. **Tu** lipești linkuri YouTube în [`links.txt`](links.txt), câte unul pe rând (direct pe GitHub, și de pe telefon).
   Opțional, o notă după link: `https://youtu.be/XXXXXXXXXXX  demo pentru tehnicieni, de pus primul`.
2. **GitHub Action-ul** `Sync videos` pornește singur, află tot ce se poate despre fiecare video și salvează în
   `catalog.json`, `thumbs/` și `transcripts/`. Durează ~1 minut.
3. **Claude** citește catalogul, se uită la miniaturi și transcrieri, apoi scrie `layout.json`:
   ce video e principal, în ce secțiuni intră, în ce ordine și cu ce texte.
4. **Pagina** [`/videos/`](index.html) afișează aranjamentul. Video-urile noi, încă nearanjate, apar jos la „De aranjat”.

Dacă ștergi un link din `links.txt`, dispare și din catalog. Pagina are `noindex` și nu e legată din meniu
până nu o aprobi.

## Pentru Claude: cum aranjezi

1. `git pull` — Action-ul face commituri pe aceeași ramură.
2. Citește `catalog.json`. Pentru fiecare video ai `title`, `channel`, `duration` (secunde), `description`,
   `keywords`, `published`, `vertical` (Shorts), `embeddable`, `note` (ce a scris omul lângă link — respect-o),
   `thumb` (deschide imaginea ca s-o vezi) și `transcript.file` când există. `status: "pending"` înseamnă că
   informațiile n-au putut fi aduse încă; `errors` spune de ce.
3. Scrie `layout.json`:

   ```json
   {
     "eyebrow": "Video",
     "title": "Titlul paginii",
     "intro": "Un paragraf scurt sub titlu.",
     "featured": { "id": "XXXXXXXXXXX", "caption": "De ce să-l vezi primul." },
     "show_unplaced": true,
     "sections": [
       {
         "title": "Titlul secțiunii",
         "description": "Opțional.",
         "columns": 3,
         "videos": [
           "XXXXXXXXXXX",
           { "id": "YYYYYYYYYYY", "title": "Titlu mai clar decât cel de pe YouTube", "caption": "O frază.",
             "start": 42, "wide": true }
         ]
       }
     ]
   }
   ```

   - `featured` și elementele din `videos` pot fi doar ID-ul sau un obiect; `title`, `caption`, `start` (secunde)
     și `wide` (ocupă două coloane) sunt opționale.
   - `columns`: 2, 3 (implicit) sau 4. O secțiune care conține doar Shorts primește automat cadre verticale.
   - `show_unplaced: false` ascunde secțiunea „De aranjat” când pagina devine publică.
4. `python3 tools/videos_sync.py --check` — verifică să nu existe ID-uri inexistente sau puse de două ori.
5. Commit, push.

Rulat local, `python3 tools/videos_sync.py` face același lucru ca Action-ul (are nevoie de acces la youtube.com;
`--refresh` reia toate video-urile, `pip install youtube-transcript-api` pentru transcrieri).

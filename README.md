# AI Scout

Persönlicher Research-Agent, der die Arbeit ausgewählter KI-Expertinnen und -Experten beobachtet und in Quick Scans, Deep-Research-Berichten und einer Wissensdatenbank aufbereitet. Grundlage ist Googles Gemini mit Google-Suche.

## Eigener API-Key (Bring Your Own Key)

AI Scout enthält **keinen** API-Key. Jede Person hinterlegt ihren eigenen Gemini-Key direkt in der App (Schlüssel-Symbol oben rechts).

- Einen kostenlosen Key gibt es bei [Google AI Studio](https://aistudio.google.com/app/apikey). Für Deep Research mit dem Pro-Modell können Kosten entstehen; diese laufen über das eigene Google-Konto.
- Der Key wird nur im Browser gespeichert und ausschließlich an Google gesendet. Es gibt keinen eigenen Server und keine Benutzerkonten.
- **Standard:** Der Key gilt nur für die aktuelle Sitzung und wird beim Schließen des Tabs automatisch gelöscht.
- **Optional:** „Auf diesem Gerät merken“ speichert den Key dauerhaft im Browser. Das sollte nur auf eigenen, privaten Geräten genutzt werden. Die Verantwortung dafür liegt bei der nutzenden Person.
- Empfehlung: In Google AI Studio ein Ausgabenlimit setzen.

## Wie Deep Research prüft

Der Bericht entsteht in drei Schritten:

1. **Suche in kleinen Gruppen.** Die aktiven Personen werden nach Kategorie in Gruppen von höchstens vier aufgeteilt und einzeln gesucht, damit niemand untergeht. Zeitraum: die letzten 14 Tage.
2. **Prüfung jedes Fundes.** Einträge ohne sicheres Datum oder außerhalb des Zeitraums werden aussortiert. Jeder verbleibende Eintrag wird mit den Treffern abgeglichen, die die Google-Suche tatsächlich geliefert hat.
3. **Einordnung.** Überschrift, Einleitung und Impulse entstehen ohne weitere Suche, nur aus den geprüften Funden.

| Kennzeichnung | Bedeutung |
|---|---|
| **Quelle belegt** | Die Suche stützt genau diesen Eintrag, mit einem Treffer von derselben Website wie der Link. |
| **Teilweise belegt** | Die Suche stützt den Eintrag nur über eine andere Website, oder die Website des Links kam in der Suche vor, aber nicht zu diesem Eintrag. |
| **Unbelegt** | Kein Suchtreffer stützt den Eintrag. Link und Zuschreibung können falsch sein. |

Der **Prüfbericht** unter der Einleitung zeigt, zu wie vielen Personen gesucht wurde, was aussortiert wurde und für wen die Suche fehlgeschlagen ist.

Grenzen: „Belegt“ heißt, dass die Suche den Eintrag stützt, nicht, dass jede Aussage stimmt. Beiträge auf X und LinkedIn erfasst die Google-Suche nur lückenhaft. Vor dem Weitergeben eines Eintrags gehört der eigene Blick in die Quelle dazu.

Für die Suche braucht der API-Key ein Kontingent für „Grounding with Google Search“. Meldet die App ein erschöpftes Kontingent, lässt sich das unter [ai.dev/rate-limit](https://ai.dev/rate-limit) prüfen.

## Daten sichern und auf mehreren Geräten nutzen

Recherchen, Markierungen und die Expertenliste liegen zunächst nur im Browser. Über das Symbol **Daten & Sicherung** (oben rechts) gibt es drei Wege:

| Weg | Funktioniert auf | Hinweis |
|---|---|---|
| **Google Drive** | allen Geräten | speichert automatisch in `ai-scout-daten.json` im eigenen Drive; Einrichtung siehe [docs/google-drive-einrichtung.md](docs/google-drive-einrichtung.md) |
| **Automatisch in Datei** | Chrome, Edge, Dia, Arc am Computer | Datei am besten in einen OneDrive-, Google-Drive- oder iCloud-Ordner legen |
| **Manuelle Sicherung** | überall | Datei herunterladen und auf einem anderen Gerät einspielen |

Weichen zwei Stände voneinander ab, gewinnt der neuere. Bevor ein neuerer Stand aus der Cloud die Daten im Browser ersetzt, fragt die App nach. Der API-Key wird nie mitgesichert.

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev
```

Danach `http://localhost:3000` öffnen und den eigenen Key über das Schlüssel-Symbol hinterlegen. Eine `.env`-Datei wird nicht mehr benötigt.

Tests ausführen (Prüflogik und Ablauf der Recherche, ohne echte API-Aufrufe):

```bash
npm test
```

## Veröffentlichung über GitHub Pages

Der Workflow `.github/workflows/deploy-pages.yml` baut die App bei jedem Push auf `main` und veröffentlicht sie unter `https://<github-user>.github.io/<repo>/`.

Einmalig einrichten: Im Repository unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen.

## Lizenz

Veröffentlicht unter der [MIT-Lizenz](LICENSE). Die Nutzung erfolgt ohne Gewähr; insbesondere für Kosten, die über den eigenen API-Key entstehen, ist jede Person selbst verantwortlich.

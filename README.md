# AI Scout

Persönlicher Research-Agent, der die Arbeit ausgewählter KI-Expertinnen und -Experten beobachtet und in Quick Scans, Deep-Research-Berichten und einer Wissensdatenbank aufbereitet. Grundlage ist Googles Gemini mit Google-Suche.

## Eigener API-Key (Bring Your Own Key)

AI Scout enthält **keinen** API-Key. Jede Person hinterlegt ihren eigenen Gemini-Key direkt in der App (Schlüssel-Symbol oben rechts).

- Einen kostenlosen Key gibt es bei [Google AI Studio](https://aistudio.google.com/app/apikey). Für Deep Research mit dem Pro-Modell können Kosten entstehen; diese laufen über das eigene Google-Konto.
- Der Key wird nur im Browser gespeichert und ausschließlich an Google gesendet. Es gibt keinen eigenen Server und keine Benutzerkonten.
- **Standard:** Der Key gilt nur für die aktuelle Sitzung und wird beim Schließen des Tabs automatisch gelöscht.
- **Optional:** „Auf diesem Gerät merken“ speichert den Key dauerhaft im Browser. Das sollte nur auf eigenen, privaten Geräten genutzt werden. Die Verantwortung dafür liegt bei der nutzenden Person.
- Empfehlung: In Google AI Studio ein Ausgabenlimit setzen.

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

## Veröffentlichung über GitHub Pages

Der Workflow `.github/workflows/deploy-pages.yml` baut die App bei jedem Push auf `main` und veröffentlicht sie unter `https://<github-user>.github.io/<repo>/`.

Einmalig einrichten: Im Repository unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen.

## Lizenz

Veröffentlicht unter der [MIT-Lizenz](LICENSE). Die Nutzung erfolgt ohne Gewähr; insbesondere für Kosten, die über den eigenen API-Key entstehen, ist jede Person selbst verantwortlich.

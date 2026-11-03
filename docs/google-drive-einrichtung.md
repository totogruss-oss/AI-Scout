# Google Drive einrichten (einmalig, ca. 10 Minuten)

Damit „Mit Google verbinden“ in AI Scout funktioniert, braucht die App eine eigene, kostenlose **OAuth-Client-ID** von Google. Sie ist kein Geheimnis: Sie sagt Google nur, welche App um Zugriff bittet. Ein Client-Secret wird nicht benötigt.

Die App fordert ausschließlich die Berechtigung `drive.file` an. Damit sieht sie nur die Dateien, die sie selbst angelegt hat (`ai-scout-daten.json`), nicht die übrigen Dokumente im Drive.

> Tipp: Verwende dafür dein **privates** Google-Konto, kein dienstliches.

## Teil A: Google Cloud Console

1. **Projekt anlegen**
   [console.cloud.google.com](https://console.cloud.google.com) öffnen und anmelden. Oben links auf die Projektauswahl klicken, dann **Neues Projekt**. Name: `AI Scout`. **Erstellen**.

2. **Google Drive API aktivieren**
   Im Suchfeld oben „Google Drive API“ eingeben, den Treffer öffnen und auf **Aktivieren** klicken.

3. **Zustimmungsbildschirm einrichten**
   Im Menü links **Google Auth Platform** öffnen (heißt teils noch „OAuth-Zustimmungsbildschirm“) und auf **Jetzt starten** klicken.
   - App-Name: `AI Scout`
   - Nutzersupport-E-Mail: deine Adresse
   - Zielgruppe: **Extern**
   - Kontaktdaten: deine Adresse
   - Den Richtlinien zustimmen und **Erstellen** klicken.

4. **Dich selbst als Testnutzer eintragen**
   Links auf **Zielgruppe** klicken, dann unter **Testnutzer** auf **Nutzer hinzufügen** und deine Google-Adresse eintragen. Weitere Personen, die die Drive-Funktion nutzen sollen, ebenfalls hier eintragen (bis zu 100).

5. **Client-ID erstellen**
   Links **Clients** wählen, dann **Client erstellen**.
   - Anwendungstyp: **Webanwendung**
   - Name: `AI Scout Web`
   - **Autorisierte JavaScript-Quellen**, zwei Einträge:
     - `https://totogruss-oss.github.io`
     - `http://localhost:3000`
   - Weiterleitungs-URIs: leer lassen.
   - **Erstellen** klicken und die angezeigte **Client-ID** kopieren. Sie endet auf `.apps.googleusercontent.com`.

## Teil B: Client-ID bei GitHub hinterlegen

6. Im Repository **⚙ Settings → Secrets and variables → Actions** öffnen.
7. Den Reiter **Variables** wählen (nicht „Secrets“) und auf **New repository variable** klicken.
   - Name: `GOOGLE_CLIENT_ID`
   - Wert: die kopierte Client-ID
8. Unter **Actions → Deploy to GitHub Pages → Run workflow** die App einmal neu veröffentlichen.

Danach erscheint in der App unter **Daten & Sicherung** der Bereich **Google Drive**.

## Beim ersten Verbinden

Solange die App im Status „Testing“ ist, zeigt Google den Hinweis **„Google hat diese App nicht überprüft“**. Das ist normal, weil es deine eigene App ist: Auf **Weiter** klicken und den Zugriff erlauben.

## Später: für alle freigeben

Im Status „Testing“ können sich nur eingetragene Testnutzer verbinden. Soll die Drive-Funktion für beliebige Personen funktionieren, unter **Google Auth Platform → Zielgruppe** auf **App veröffentlichen** klicken. Weil `drive.file` als nicht sensible Berechtigung gilt, verlangt Google dafür nur eine einfache Prüfung (u. a. Startseite und Datenschutzerklärung), keine Sicherheitsbewertung.

## Lokal entwickeln

Eine Datei `.env.local` im Projektordner anlegen (wird nicht ins Repository übernommen):

```
VITE_GOOGLE_CLIENT_ID=deine-client-id.apps.googleusercontent.com
```

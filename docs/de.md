# Piwigo

Deine [Piwigo](https://piwigo.org)-Fotogalerie in Gladys, über dein lokales
Netzwerk: die Anzahl der Fotos, Alben und Benutzer, das zuletzt hinzugefügte
Foto, ein Gerät pro Album, das du verfolgen willst, Szenen, die auf neue Fotos
oder ein wachsendes Album reagieren, eine Szenenaktion, die die letzten Fotos
liest, und ein Dashboard-Widget mit den neuesten Fotos.

Die Integration wurde mit einer echten Piwigo-Galerie getestet (das
Docker-Image `linuxserver/piwigo`, Piwigo 16.4.0), aber noch nicht in einer
echten Gladys-Installation: Rückmeldungen sind willkommen im
[Gladys-Forum](https://community.gladysassistant.com) oder in den
[Issues](https://github.com/guim31/gladys-piwigo/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Eine **Piwigo**-Galerie, die von Gladys aus erreichbar ist (gleiches
  Netzwerk).
- Am besten einen **API-Schlüssel** (Piwigo 16 oder neuer): Öffne in Piwigo
  dein **Profil**, **API-Schlüssel**, lege einen an und kopiere den ganzen
  Schlüssel: seine Kennung, einen Doppelpunkt, sein Geheimnis
  (`pkid-20261025-…:…`). Der Schlüssel handelt wie sein Konto: Ein
  **Administrator**-Schlüssel liefert auch die Anzahl der Benutzer.
- Sonst Benutzername und Passwort eines Kontos (jede Piwigo-Version mit
  Web-API).
- Ohne beides liest die Integration die Galerie als Gast: nur öffentliche
  Alben.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib in der **Konfiguration** die **Adresse der Galerie** mit Port und Ordner
   ein (zum Beispiel `http://192.168.1.20/piwigo`; eine aus dem Browser kopierte
   Seite der Galerie geht auch) und füge den **API-Schlüssel** ins
   Passwortfeld ein, den Benutzernamen leer. Mit einem Konto gibst du
   stattdessen Benutzername und Passwort ein.
3. Optional trägst du die **Zu verfolgenden Alben** ein: Namen oder IDs durch
   Kommas getrennt (`Urlaub, 12`); ein Unteralbum über seinen Pfad
   (`Urlaub / Strand`). Die ID ist die Zahl am Ende der Albumadresse
   (`index.php?/category/12`): Verwende sie für einen Namen mit Komma.
4. Wähle die **Aktualisierung** (standardmäßig 5 Minuten) und die **Sprache der
   Namen** und speichere. **Verbindung testen** liest die Galerie sofort und
   meldet die nicht gefundenen Alben.
5. Füge unter **Erkennung** das Gerät **Piwigo** und die gewünschten
   Albumgeräte hinzu.

## Geräte

Das Gerät **Piwigo** zeigt die ganze Galerie (nur lesend):

| Funktion                   | Was sie zeigt                                                   |
| -------------------------- | --------------------------------------------------------------- |
| Fotos                      | Fotos, die das Konto sehen kann                                 |
| Alben                      | Alben, die das Konto sehen kann, Unteralben inbegriffen         |
| Benutzer                   | Benutzer der Galerie (nur Administrator-Konto oder -Schlüssel)  |
| Zuletzt hinzugefügtes Foto | Name, Album und Tag: `Sonnenuntergang · Urlaub · 25. Okt. 2026` |

Jedes verfolgte Album ergibt ein Gerät **Piwigo – Albumpfad**:

| Funktion         | Was sie zeigt                                                           |
| ---------------- | ----------------------------------------------------------------------- |
| Fotos            | Fotos des Albums und seiner Unteralben                                  |
| Letzte Ergänzung | Tag und Uhrzeit des zuletzt hinzugefügten Fotos: `25. Okt. 2026, 07:50` |

Die Integration liest die Galerie selbst (drei oder vier kleine Anfragen pro
Abfrage): Auf der Gladys-Seite ist nichts einzustellen. Das Verbindungssymbol
der Geräte wird rot, wenn die Galerie nicht mehr antwortet.

## Dashboard

Das Widget **Neueste Fotos** zeigt die Zähler (Fotos, Alben, Benutzer) und die
zuletzt hinzugefügten Fotos: Name, Album, Tag; ein Tippen zeigt die Uhrzeit
des Hinzufügens und den Aufnahmetag. Mit der Einstellung **Verfolgtes Album**
zeigt es eines deiner verfolgten Alben statt der ganzen Galerie.

Vorschaubilder sind **standardmäßig aus**: Mit der Einstellung
**Vorschaubilder anzeigen** erscheint das kleine Vorschaubild jedes Fotos, und
deine Fotos sind dann auf jedem Bildschirm zu sehen, der dieses Dashboard zeigt
(ein geteiltes Tablet, ein öffentliches Dashboard, Gladys Plus). Der Browser
lädt Piwigo nie direkt: Gladys fragt die Integration, die nur die Fotos der
Widget-Liste ausliefert.

## Szenen

### Auslöser

- **Neue Fotos hinzugefügt**: Der Galerie wurden Fotos hinzugefügt, egal auf
  welchem Weg (Web-Upload, mobile App, Synchronisierung), bei der nächsten
  Abfrage erkannt. Variablen: Anzahl hinzugefügter Fotos, Name, Album,
  Hinzufügedatum und Seite des letzten.
- **Fotos zu einem Album hinzugefügt**: Ein Album (mit Unteralben) enthält
  mehr Fotos als bei der letzten Abfrage (ein neues Album zählt ab null).
  Filter: der Albumname, genau wie in Piwigo, ohne übergeordnete Alben.
  Variablen: Name, Pfad und ID des Albums, hinzugefügte Fotos, Fotos im Album,
  Seite des Albums. Ein Foto in einem Unteralbum löst diesen Auslöser auch für
  die übergeordneten Alben aus.

### Aktionen

- **Letzte Fotos lesen**: liest sofort die zuletzt hinzugefügten Fotos der
  ganzen Galerie oder eines Albums (Name, Pfad oder ID; Unteralben
  inbegriffen). Ausgaben für die nächsten Aktionen der Szene: in 24 Stunden
  hinzugefügte Fotos, Fotos insgesamt, Name, Album, Hinzufügedatum und Seite des
  letzten. In Piwigo ändert sich nichts.

### Szenenideen

- Bei **Neue Fotos hinzugefügt** schickst du der Familie eine Nachricht:
  „{{count}} neue Fotos, das letzte: {{name}} in {{album}}“.
- Jeden Abend um 21 Uhr **Letzte Fotos lesen** für das Album „Familie“, und
  wenn **In 24 Stunden hinzugefügte Fotos** über 0 liegt, eine Nachricht auf
  dem Wohnzimmer-Tablet zeigen.
- Bei **Fotos zu einem Album hinzugefügt** „Urlaub 2026“ den Flur blau
  einschalten.

## Fehlerbehebung

- **„API-Schlüssel, Benutzername oder Passwort abgelehnt“**: Der Schlüssel ist
  abgelaufen, wurde widerrufen oder nicht ganz eingefügt (Kennung, Doppelpunkt,
  Geheimnis); prüfe bei einem Konto das Passwort.
- **„die Galerie antwortet nicht“**: Prüfe Adresse, Port und Ordner vom
  Gladys-Rechner aus.
- **„keine Piwigo-Galerie unter dieser Adresse“**: Die Adresse führt zu einer
  anderen Seite (Anmeldeseite eines Reverse-Proxys, andere Anwendung): Gib die
  Adresse der Galerie selbst ein.
- **„Zertifikat abgelehnt“**: ein selbstsigniertes Zertifikat; verwende die
  `http://`-Adresse in deinem Netzwerk.
- **Neue Fotos erscheinen nicht**: Piwigo kann die über die mobile App oder die
  Web-API gesendeten Fotos in einem Warteraum (der „Lounge“) halten, bis der
  Upload fertig ist; sie erscheinen bei der nächsten Abfrage danach.
- **Die Anzahl der Benutzer bleibt leer**: Das Konto oder der Schlüssel ist
  kein Administrator.
- `LOG_LEVEL=debug` in den Protokollen der Integration zeigt jede Abfrage.

## Grenzen

- Neue Fotos werden bei der nächsten Abfrage erkannt (standardmäßig 5 Minuten),
  und nur die, die das Konto sehen kann.
- Die Integration liest nur: In Piwigo wird nichts geändert, hochgeladen oder gelöscht.
- Kein Foto verlässt dein Netzwerk über die Integration, außer du schaltest
  die Vorschaubilder des Widgets ein.
- Die Daten sind die des Piwigo-Servers, so wie er sie anzeigt.
- Nicht mit dem Piwigo-Projekt verbunden.

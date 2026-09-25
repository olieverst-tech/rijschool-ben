# Correcties op de brondata — rijschool-ben

## E-mailadres (2026-09-23)

**Probleem:** de bronsite (rijschoolben.nl, Wix) gebruikt drie verschillende
e-mailadressen:

| Plek op de bronsite                              | Zichtbare tekst                  | Link (`href`)                  |
|--------------------------------------------------|----------------------------------|--------------------------------|
| Kop "PROEFLES Rijschool Ben"                     | —                                | `mailto:info@rijschoolleuk.nl` |
| Knop "mail mij direct voor je eerst proefles"    | —                                | `mailto:info@rijschoolben.nl`  |
| Contactblok                                      | `info@rijschoolben.nl`           | `mailto:info@mysite.com`       |
| Mail-icoon (social-balk)                         | —                                | `mailto:info@rijschoolleuk.nl` |
| Footer                                           | `info@rijschoolben.nl`           | `mailto:info@rijschoolben.nl`  |

`info@rijschoolleuk.nl` is vermoedelijk een restant van het vorige bedrijf
(kinder-restaurant LEUK), `info@mysite.com` is de Wix-sjabloonwaarde.

**Besluit klant:** `info@rijschoolben.nl` is het juiste adres.

**Wat is aangepast:**
- `content.json` — geen tekstwijziging nodig: de foute adressen stonden alleen
  in link-doelen (`href`), die `scrape-site.js` niet opslaat. In de zichtbare
  tekst (en dus in `content.json`) komt uitsluitend `info@rijschoolben.nl`
  voor (3×).
- `site/` — elke `mailto:`-link op de nieuwe site verwijst naar
  `info@rijschoolben.nl`.

## Telefoonnummer (2026-09-23)

**Probleem:** de zichtbare tekst op de bronsite (en in `content.json`) is
`06 43157777`, maar de knop "BEL BENNIE" op de bronsite belt
`tel:06-45317777` (cijfers 4315 ↔ 4531 omgewisseld).

**Besluit klant:** `06 43157777` is het juiste nummer (bevestigd).

**Wat is aangepast:** `content.json` bevatte al alleen het juiste nummer.
Elke `tel:`-link op de nieuwe site (4×, waaronder "BEL BENNIE") is
`tel:+31643157777`; het foute nummer komt nergens in `site/` voor.

## Social media (2026-09-23)

De scrape-data bevat geen profiel-URL's (de scraper slaat geen link-doelen
op). De klant heeft deze URL's zelf aangeleverd en bevestigd; ze staan bij
Contact op de site:

- Facebook: https://www.facebook.com/profile.php?id=100085636998678
- Instagram: https://www.instagram.com/rijschoolben/

De bronsite linkt ook naar `instagram.com/rijschoolleuk` (restant van het
vorige bedrijf); die is bewust **niet** overgenomen.

## Weggelaten: SEO-keywordlijst (2026-09-23)

De regel "goedkoperijschool, rijbewijs B, rijles, …, slagen, rijschool" staat
zichtbaar op de bronsite en in `content.json`. Dat is een verouderde
SEO-techniek (geen zinsbouw, niet gericht tot een bezoeker), geen content, en
is daarom weggelaten — ook uit de `<meta name="keywords">`. Staat in
`check-diff-ignore.json`.

## Rijdende auto in de "GET ON THE ROAD!"-band (2026-09-23)

De witte Peugeot 3008 in bovenaanzicht (door de klant aangeleverd:
`media/car/peugeot-3008-topdown-transparent.png`) rijdt elke 9 s van links
naar rechts door de zwarte band, verticaal gecentreerd tussen de bovenste en
onderste wegmarkering, in een laag onder de tekst. Uitgeschakeld bij
`prefers-reduced-motion`.

**Let op:** `scrape-site.js` wist `media/` bij elke run. Het bestand is
daarom gekopieerd naar `site/images/lesauto-bovenaanzicht.png`; bewaar het
origineel ook buiten `media/`, anders gaat het bij een nieuwe scrape verloren.

(Eerdere versies, met de uitgesneden lesautofoto over de hero-foto en daarna
een SVG-silhouet op de onderste streep, zijn op verzoek van de klant
vervangen.)

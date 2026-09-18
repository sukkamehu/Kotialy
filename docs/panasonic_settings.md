# 📋 Panasonic Aquarea - Asetusparametrit (Kirjattu 18.09.2026)

Tähän dokumenttiin on kirjattu lämpöpumpun ohjauspaneelista todetut parametrit, niiden selitykset sekä analyysi suhteessa Kotiälyn APC-älyohjaukseen.

---

## ⚙️ Tallennetut parametrit

| Parametri | Suomenkielinen nimi paneelissa | Asetettu arvo | Säätöalue | Tehtävä ja vaikutus |
|---|---|---|---|---|
| **Heating OFF Outdoor Temp** | `Lämmitys OFF: Ulkolämpötila` | **6 °C** | 5 °C ~ 35 °C | Ulkolämpötilaraja, jonka yläpuolella laite ei tee lainkaan huonelämmitystä. |
| **Tank Heating Max Time** | `Säiliö: Lämmitysaika (enint.)` | **1:00** (60 min) | 0:05 ~ 4:00 | Maksimiaika, jonka pumppu lämmittää taloa ennen kuin se vaihtaa takaisin tekemään käyttövettä (tilassa Lämmitys + KV). |
| **DHW Re-heat Temp Diff** | `Säiliö: Uud.lämm.lämpötila` | **-8 °C** | -12 °C ~ -2 °C | Käyttöveden hystereesi: lämmitys käynnistyy uudelleen vasta kun säiliön lämpö laskee tavoite - 8 °C. |
| **DHW Tank Max Operation Time** | `Säiliö: Toim.aika (enint.)` | **4:00** (240 min) | 0:30 ~ 10:00 | Maksimiaika, jonka laite tekee yhtäjaksoisesti pelkkää käyttövettä ennen tilapäistä siirtymistä huonelämmitykseen. |
| **Heating Delta T** | `Lämm.ON: ΔT` | **5 °C** | 1 °C ~ 15 °C | Lämmityksen tavoitelämpötilaero (menovesi vs. paluuvesi). |

---

## 🔍 Parametrien analyysi & Huomiot

### 1. ⚠️ `Lämmitys OFF: Ulkolämpötila` (6 °C)
- **Tila:** Huomioitava!
- **Analyysi:** 6 °C on suomalaisissa pientaloissa matala lämmityksen katkaisuraja. Jos ulkona on esimerkiksi +8 °C ... +11 °C, talo ja puskurivaraaja saattavat viilentyä, koska pumppu pitää huonelämmityspiirin sammutettuna.
- **Suositus:** Jos havaitset huonelämpötilan laskevan syksyllä tai keväällä liikaa ennen pakkasia, nosta tämä arvoon **10 °C – 13 °C**.
- **APC-yhteensopivuus:** Kotiälyn APC-ohjaimen lämmityksen katkaisurajaksi kannattaa laittaa sama arvo, jotta molemmat järjestelmät toimivat saumattomasti yhteen.

### 2. ✅ `Säiliö: Lämmitysaika (enint.)` (1:00)
- **Tila:** Erinomainen.
- **Analyysi:** 1 tunnin jakso takaa, että lämmitys ja käyttövesi vuorottelevat tasapainoisesti eikä kumpikaan puoli kärsi pitkistä katkoista.

### 3. ✅ `Säiliö: Uud.lämm.lämpötila` (-8 °C)
- **Tila:** Erinomainen pörssisähköohjaukselle!
- **Analyysi:** Suuri -8 °C hystereesi estää kompressorin turhan pätkäkäynnin ja antaa APC-älyohjaimelle erinomaisen pelivaran siirtää käyttöveden latauksen vuorokauden halvimmille tunneille.

### 4. ✅ `Säiliö: Toim.aika (enint.)` (4:00)
- **Tila:** Erinomainen.
- **Analyysi:** Antaa lämpöpumpulle riittävästi aikaa nostaa käyttövesi kuumaksi matalilla kierroksilla ja hyvällä COP-hyötysuhteella.

### 5. ✅ `Lämm.ON: ΔT` (5 °C)
- **Tila:** Täydellinen.
- **Analyysi:** 5 °C on ihanteellinen ja energiatehokkain standardiarvo vesikiertoiselle lattialämmitykselle ja puskurivaraajalle.

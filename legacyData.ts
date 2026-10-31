/**
 * Bild-URLs aus der ursprünglichen Expertenliste (v1). Sie waren größtenteils
 * von der KI generiert und nicht erreichbar bzw. zeigten falsche Personen.
 * Gespeicherte Profile mit genau diesen URLs werden beim Laden bereinigt.
 */
export const LEGACY_IMAGE_URLS: ReadonlySet<string> = new Set([
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Andrew_Ng_-_Time_100_Gala_2024_%28cropped%29.jpg/800px-Andrew_Ng_-_Time_100_Gala_2024_%28cropped%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Geoffrey_Hinton_at_the_2024_Nobel_Prize_Press_Conference_%28cropped%29.jpg/800px-Geoffrey_Hinton_at_the_2024_Nobel_Prize_Press_Conference_%28cropped%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Yann_LeCun_-_2018_%28cropped%29.jpg/800px-Yann_LeCun_-_2018_%28cropped%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Fei-Fei_Li_2024.jpg/800px-Fei-Fei_Li_2024.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Demis_Hassabis_Royal_Society.jpg/800px-Demis_Hassabis_Royal_Society.jpg',
  'https://avatars.githubusercontent.com/u/17522?v=4',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Yoshua_Bengio_2019.jpg/800px-Yoshua_Bengio_2019.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Ian_Goodfellow.jpg/800px-Ian_Goodfellow.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Cassie_Kozyrkov_2019.jpg/800px-Cassie_Kozyrkov_2019.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Mustafa_Suleyman_2023.jpg/800px-Mustafa_Suleyman_2023.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Doris_Wessels_2023.jpg/800px-Doris_Wessels_2023.jpg',
  'https://avatars.githubusercontent.com/u/10137?v=4',
  'https://avatars.githubusercontent.com/u/19875334?v=4',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Yasmin_Weiss_2022.jpg/800px-Yasmin_Weiss_2022.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Dario_Amodei_2023.jpg/800px-Dario_Amodei_2023.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Mira_Murati_2023.jpg/800px-Mira_Murati_2023.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Stuart_J._Russell_2019.jpg/800px-Stuart_J._Russell_2019.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Timnit_Gebru_2021.jpg/800px-Timnit_Gebru_2021.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Gary_Marcus_2019.jpg/800px-Gary_Marcus_2019.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Max_Tegmark_2018.jpg/800px-Max_Tegmark_2018.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/J%C3%BCrgen_Schmidhuber_2017.jpg/800px-J%C3%BCrgen_Schmidhuber_2017.jpg',
]);

/**
 * Nachweislich falsche X-Handles aus v1 → korrigierter Wert (undefined = entfernen,
 * weil kein gesicherter Account bekannt ist).
 */
export const LEGACY_HANDLE_FIXES: Record<string, string | undefined> = {
  '@juergenscmidhuber': '@SchmidhuberAI',
  '@psteinberger': '@steipete',
  '@fei_fei_li': '@drfeifei',
  '@timnit': '@timnitGebru',
  '@MiraMurati': '@miramurati',
  '@cassiekozyrkov': '@quaesita',
  '@TheMorpheus7': undefined,
  '@doris_wessels': undefined,
  '@YasminWeiss': undefined,
  '@darioamodei': undefined,
  '@yoshua_bengio': undefined,
  '@s_russell': undefined,
};

// Shared by the client notice and the server acknowledgement record, so the
// stored text is exactly what the teacher saw. Change the version whenever the
// text changes: the notice then shows again to teachers who closed the old one.
export const FREE_SINGLE_USE_NOTICE_VERSION = '2026-09-26';

export const FREE_SINGLE_USE_NOTICE = {
  cs: 'Ve Free můžeš každou lekci živě použít jednou. Použití se započítá, jakmile se připojí první student – i tvůj vlastní telefon na zkoušku. Jak lekci uvidí studenti, si vyzkoušej přes „Studentský režim“ v náhledu.',
  en: 'On Free, each lesson can be used live once. The use counts as soon as the first student joins – including your own phone as a test. To see what students will see, use “Student view” in the preview.',
};

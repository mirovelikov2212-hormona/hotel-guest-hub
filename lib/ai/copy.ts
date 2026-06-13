import type { AiLang } from "@/lib/ai/types";

export const AI_COPY: Record<AiLang, {
  noData: string;
  outOfScope: string;
  error: string;
  rateLimited: string;
  path: string;
  openLink: string;
  price: string;
  hours: string;
  options: string;
  available: string;
  requestHint: string;
  clarify: string;
}> = {
  bg: {
    noData: "Нямам потвърдена информация за това в данните на хотела. Моля, обърнете се към рецепция.",
    outOfScope: "Мога да помагам само с информация за хотела, неговите услуги и престоя Ви.",
    error: "В момента не мога да обработя въпроса. Моля, опитайте отново или се обърнете към рецепция.",
    rateLimited: "Изпратихте твърде много въпроси за кратко време. Моля, опитайте отново след малко.",
    path: "Намира се в",
    openLink: "Отвори линка",
    price: "Цена",
    hours: "Работно време",
    options: "Възможности",
    available: "Да, тази услуга е налична.",
    requestHint: "Можете да я заявите директно от посочената секция в хъба.",
    clarify: "Моля, уточнете какво точно имате предвид.",
  },
  en: {
    noData: "I do not have confirmed information about this in the hotel data. Please contact reception.",
    outOfScope: "I can only help with information about the hotel, its services and your stay.",
    error: "I cannot process the question right now. Please try again or contact reception.",
    rateLimited: "You sent too many questions in a short time. Please try again shortly.",
    path: "Find it in",
    openLink: "Open link",
    price: "Price",
    hours: "Opening hours",
    options: "Options",
    available: "Yes, this service is available.",
    requestHint: "You can request it directly from the indicated section in the hub.",
    clarify: "Please clarify what you mean.",
  },
  de: {
    noData: "Dazu habe ich keine bestätigte Information in den Hoteldaten. Bitte wenden Sie sich an die Rezeption.",
    outOfScope: "Ich kann nur mit Informationen über das Hotel, seine Leistungen und Ihren Aufenthalt helfen.",
    error: "Ich kann die Frage im Moment nicht bearbeiten. Bitte versuchen Sie es erneut oder wenden Sie sich an die Rezeption.",
    rateLimited: "Sie haben in kurzer Zeit zu viele Fragen gesendet. Bitte versuchen Sie es gleich noch einmal.",
    path: "Zu finden unter",
    openLink: "Link öffnen",
    price: "Preis",
    hours: "Öffnungszeiten",
    options: "Optionen",
    available: "Ja, dieser Service ist verfügbar.",
    requestHint: "Sie können ihn direkt im angegebenen Bereich des Hubs anfragen.",
    clarify: "Bitte präzisieren Sie, was Sie meinen.",
  },
  ro: {
    noData: "Nu am informații confirmate despre acest lucru în datele hotelului. Vă rugăm să contactați recepția.",
    outOfScope: "Pot ajuta doar cu informații despre hotel, serviciile sale și sejurul dumneavoastră.",
    error: "Nu pot procesa întrebarea momentan. Încercați din nou sau contactați recepția.",
    rateLimited: "Ați trimis prea multe întrebări într-un timp scurt. Încercați din nou în curând.",
    path: "Se găsește în",
    openLink: "Deschide linkul",
    price: "Preț",
    hours: "Program",
    options: "Opțiuni",
    available: "Da, acest serviciu este disponibil.",
    requestHint: "Îl puteți solicita direct din secțiunea indicată în hub.",
    clarify: "Vă rugăm să precizați ce anume aveți în vedere.",
  },
  cs: {
    noData: "V hotelových údajích nemám k tomuto potvrzené informace. Obraťte se prosím na recepci.",
    outOfScope: "Mohu pomoci pouze s informacemi o hotelu, jeho službách a vašem pobytu.",
    error: "Dotaz nyní nemohu zpracovat. Zkuste to znovu nebo kontaktujte recepci.",
    rateLimited: "Během krátké doby jste odeslali příliš mnoho dotazů. Zkuste to prosím za chvíli.",
    path: "Najdete v",
    openLink: "Otevřít odkaz",
    price: "Cena",
    hours: "Otevírací doba",
    options: "Možnosti",
    available: "Ano, tato služba je k dispozici.",
    requestHint: "Můžete o ni požádat přímo v uvedené sekci hubu.",
    clarify: "Upřesněte prosím, co máte na mysli.",
  },
  ru: {
    noData: "В данных отеля нет подтверждённой информации по этому вопросу. Пожалуйста, обратитесь на ресепшен.",
    outOfScope: "Я могу помогать только с информацией об отеле, его услугах и вашем проживании.",
    error: "Сейчас я не могу обработать вопрос. Попробуйте ещё раз или обратитесь на ресепшен.",
    rateLimited: "Вы отправили слишком много вопросов за короткое время. Пожалуйста, повторите попытку немного позже.",
    path: "Находится в",
    openLink: "Открыть ссылку",
    price: "Цена",
    hours: "Часы работы",
    options: "Варианты",
    available: "Да, эта услуга доступна.",
    requestHint: "Вы можете заказать её прямо в указанном разделе хаба.",
    clarify: "Пожалуйста, уточните, что именно вы имеете в виду.",
  },
};

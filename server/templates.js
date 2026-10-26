// Fixed, pre-reviewed tenant messages in every supported language. Used wherever the wording must be exact: identity
// checks, compensation replies, lifecycle updates, the liability-safe fallback, help text. They are drafts of
// translations: a native speaker should review each language before launch (see SETUP_NEEDED.md).
import { LANGUAGES, normalizeLanguage } from './languages.js';

export const TEXT = {
  askIdentity: {
    en: "Hi, happy to help. Before we send anyone out I need to confirm who I'm texting. Can you reply with your full name and your unit number?",
    es: 'Hola, con gusto le ayudo. Antes de enviar a alguien necesito confirmar con quién hablo. ¿Me puede responder con su nombre completo y el número de su apartamento?',
    ko: '안녕하세요, 도와드리겠습니다. 누군가를 보내기 전에 문자를 보내신 분이 누구인지 확인해야 합니다. 성함 전체와 호수를 답장으로 알려주시겠어요?',
    'zh-Hans': '您好，很乐意帮忙。在安排人员上门之前，我需要确认发信人的身份。请回复您的全名和单元号。',
    'zh-Hant': '您好，很樂意幫忙。在安排人員上門之前，我需要確認發訊人的身分。請回覆您的全名和單位號碼。',
    hy: 'Բարև, սիրով կօգնեմ։ Նախքան որևէ մեկին ուղարկելը՝ պետք է հաստատեմ, թե ում հետ եմ գրում։ Կարո՞ղ եք պատասխանել Ձեր ամբողջական անունով և բնակարանի համարով։',
    tl: 'Kumusta, masaya akong tumulong. Bago kami magpadala ng tao, kailangan kong makumpirma kung sino ang katext ko. Maaari bang ibigay ang buo ninyong pangalan at numero ng unit?',
    vi: 'Xin chào, tôi rất sẵn lòng giúp. Trước khi cử người đến, tôi cần xác nhận người đang nhắn tin. Bạn vui lòng trả lời họ tên đầy đủ và số căn hộ nhé?',
  },
  identityHold: {
    en: "Thank you. We're confirming your details with the office and someone will follow up with you shortly. For everyone's security we can't send anyone out until that's done.",
    es: 'Gracias. Estamos confirmando sus datos con la oficina y alguien le contactará en breve. Por seguridad no enviaremos a nadie hasta entonces.',
    ko: '감사합니다. 사무실에서 확인 중이며 곧 연락드리겠습니다. 모두의 안전을 위해 확인이 끝날 때까지는 아무도 보낼 수 없습니다.',
    'zh-Hans': '谢谢。我们正在与办公室确认您的信息，稍后会有人联系您。为了大家的安全，在确认完成之前我们无法派人上门。',
    'zh-Hant': '謝謝。我們正在與辦公室確認您的資料，稍後會有人聯絡您。為了大家的安全，在確認完成之前我們無法派人上門。',
    hy: 'Շնորհակալություն։ Գրասենյակի հետ ստուգում ենք Ձեր տվյալները, և շուտով կապ կհաստատենք։ Բոլորի անվտանգության համար մինչև սա չավարտվի՝ ոչ ոքի չենք կարող ուղարկել։',
    tl: "Salamat. Kinukumpirma namin ang inyong detalye sa opisina at may susunod sa inyo sa lalong madaling panahon. Para sa kaligtasan ng lahat, hindi kami makakapagpadala ng tao hangga't hindi ito natatapos.",
    vi: 'Cảm ơn bạn. Chúng tôi đang xác nhận thông tin với văn phòng và sẽ sớm liên hệ lại. Vì sự an toàn của mọi người, chúng tôi không thể cử ai đến cho đến khi xác nhận xong.',
  },
  compensation: {
    en: "I understand. I've passed your request along to the property manager, who will follow up with you personally. In the meantime we're still working on getting the repair lined up.",
    es: 'Entiendo su preocupación. Ya le pasé su solicitud al administrador de la propiedad, quien se comunicará con usted personalmente. Mientras tanto, seguimos coordinando la reparación.',
    ko: '말씀하신 내용 이해했습니다. 요청을 건물 관리자에게 전달했으며, 관리자가 직접 연락드릴 것입니다. 그동안에도 수리 일정을 계속 잡고 있습니다.',
    'zh-Hans': '我明白。我已把您的请求转交给物业经理，他会亲自与您联系。同时我们仍在继续安排维修。',
    'zh-Hant': '我明白。我已將您的請求轉交給物業經理，他會親自與您聯絡。同時我們仍在繼續安排維修。',
    hy: 'Հասկանում եմ։ Ձեր խնդրանքը փոխանցել եմ շենքի կառավարչին, որը անձամբ կկապվի Ձեզ հետ։ Մինչ այդ մենք շարունակում ենք կազմակերպել վերանորոգումը։',
    tl: 'Naiintindihan ko. Naipasa ko na ang inyong kahilingan sa property manager, na personal na makikipag-ugnayan sa inyo. Samantala, patuloy naming inaayos ang pagpapagawa.',
    vi: 'Tôi hiểu. Tôi đã chuyển yêu cầu của bạn cho quản lý tòa nhà, người sẽ trực tiếp liên hệ với bạn. Trong lúc đó, chúng tôi vẫn đang sắp xếp việc sửa chữa.',
  },
  proceedAck: {
    en: "Thanks, I have what I need. I'm lining up the right person and will text you as soon as there's a time.",
    es: 'Gracias, ya tengo lo que necesito. Estoy buscando al técnico adecuado y le escribo en cuanto haya un horario.',
    ko: '감사합니다, 필요한 내용은 다 확인했습니다. 적합한 담당자를 찾고 있으며 일정이 정해지면 바로 문자 드리겠습니다.',
    'zh-Hans': '谢谢，我已掌握所需信息。正在安排合适的人员，确定时间后会立即短信通知您。',
    'zh-Hant': '謝謝，我已掌握所需資訊。正在安排合適的人員，確定時間後會立即簡訊通知您。',
    hy: 'Շնորհակալություն, ինձ պետք եղած ամբողջ տեղեկությունն ունեմ։ Գտնում եմ համապատասխան մասնագետին և ժամանակը որոշվելուն պես կգրեմ Ձեզ։',
    tl: 'Salamat, nakuha ko na ang kailangan ko. Hinahanap ko ang tamang tao at ite-text ko kayo agad kapag may oras na.',
    vi: 'Cảm ơn bạn, tôi đã có đủ thông tin cần thiết. Tôi đang tìm đúng người và sẽ nhắn cho bạn ngay khi có giờ hẹn.',
  },
  updateAck: {
    en: "Thanks for the update. I've passed it along to the team.",
    es: 'Gracias por el aviso. Ya se lo pasé al equipo y lo tendremos en cuenta.',
    ko: '알려주셔서 감사합니다. 팀에 전달했습니다.',
    'zh-Hans': '感谢您的更新，我已转告团队。',
    'zh-Hant': '感謝您的更新，我已轉告團隊。',
    hy: 'Շնորհակալություն տեղեկացնելու համար։ Փոխանցել եմ թիմին։',
    tl: 'Salamat sa update. Naipasa ko na ito sa team.',
    vi: 'Cảm ơn bạn đã cập nhật. Tôi đã chuyển cho nhóm.',
  },
  liabilitySafe: {
    en: "Thanks for letting us know. We're getting this coordinated and will keep you posted.",
    es: 'Gracias por avisarnos. Estamos coordinando esto y le mantendremos al tanto.',
    ko: '알려주셔서 감사합니다. 현재 조율 중이며 계속 소식 전해드리겠습니다.',
    'zh-Hans': '感谢您告知。我们正在协调处理，会随时向您通报进展。',
    'zh-Hant': '感謝您告知。我們正在協調處理，會隨時向您報告進度。',
    hy: 'Շնորհակալություն տեղեկացնելու համար։ Զբաղվում ենք համակարգմամբ և կտեղեկացնենք Ձեզ։',
    tl: 'Salamat sa pagbibigay-alam. Inaayos na namin ito at ipaaalam namin sa inyo ang susunod na hakbang.',
    vi: 'Cảm ơn bạn đã báo cho chúng tôi. Chúng tôi đang phối hợp xử lý và sẽ cập nhật cho bạn.',
  },
  scheduled: {
    en: "Good news: {vendor} is scheduled for {when}. We'll let you know if anything changes.",
    es: 'Buenas noticias: {vendor} ya está programado para {when}. Si algo cambia le avisamos.',
    ko: '좋은 소식입니다: {vendor}이(가) {when}에 방문하기로 했습니다. 변동이 있으면 알려드리겠습니다.',
    'zh-Hans': '好消息：{vendor}已安排在{when}上门。如有变动我们会通知您。',
    'zh-Hant': '好消息：{vendor}已安排在{when}上門。如有變動我們會通知您。',
    hy: 'Լավ լուր․ {vendor}-ը նշանակված է {when}։ Եթե ինչ-որ բան փոխվի, կտեղեկացնենք։',
    tl: 'Magandang balita: nakaiskedyul ang {vendor} sa {when}. Ipaaalam namin kung may magbago.',
    vi: 'Tin vui: {vendor} đã được hẹn vào {when}. Nếu có thay đổi, chúng tôi sẽ báo bạn.',
  },
  resolved: {
    en: "Your maintenance request is marked complete. If anything doesn't look right, just reply to this message.",
    es: 'Su solicitud de mantenimiento está marcada como completada. Si algo no quedó bien, solo responda a este mensaje.',
    ko: '요청하신 정비 작업이 완료로 표시되었습니다. 문제가 있으면 이 메시지에 답장해 주세요.',
    'zh-Hans': '您的维修请求已标记为完成。如果有任何问题，请直接回复此短信。',
    'zh-Hant': '您的維修請求已標記為完成。如果有任何問題，請直接回覆此簡訊。',
    hy: 'Ձեր սպասարկման հայտը նշված է որպես ավարտված։ Եթե ինչ-որ բան այնպես չէ, պարզապես պատասխանեք այս հաղորդագրությանը։',
    tl: 'Naka-markang tapos na ang inyong maintenance request. Kung may hindi tama, i-reply lang ang mensaheng ito.',
    vi: 'Yêu cầu bảo trì của bạn đã được đánh dấu hoàn tất. Nếu có gì chưa ổn, bạn chỉ cần trả lời tin nhắn này.',
  },
  closedNoVerify: {
    en: "We weren't able to confirm your details by text. Please call the office and we'll take it from there.",
    es: 'No pudimos confirmar su identidad por este medio. Por favor llame a la oficina para continuar.',
    ko: '문자로는 본인 확인을 할 수 없었습니다. 사무실로 전화해 주시면 이어서 도와드리겠습니다.',
    'zh-Hans': '我们无法通过短信确认您的身份。请致电办公室，我们会继续为您处理。',
    'zh-Hant': '我們無法透過簡訊確認您的身分。請致電辦公室，我們會繼續為您處理。',
    hy: 'Չկարողացանք հաստատել Ձեր տվյալները հաղորդագրությամբ։ Խնդրում ենք զանգահարել գրասենյակ, և մենք կշարունակենք։',
    tl: 'Hindi namin makumpirma ang inyong detalye sa text. Pakitawagan ang opisina at itutuloy namin doon.',
    vi: 'Chúng tôi không thể xác nhận thông tin của bạn qua tin nhắn. Vui lòng gọi văn phòng để chúng tôi tiếp tục hỗ trợ.',
  },
  // Sent once when someone writes in a language we don't support. {language} is the language on their account.
  translateNote: {
    en: 'I can text with you in any language using translation, but my primary language is {language}, the one set on your account.',
    es: 'Puedo escribirle en cualquier idioma usando traducción, pero mi idioma principal es {language}, el que eligió al crear su cuenta.',
    ko: '번역을 이용해 어떤 언어로든 문자를 주고받을 수 있지만, 제 기본 언어는 {language}이며 계정에 설정된 언어입니다.',
    'zh-Hans': '我可以借助翻译用任何语言与您短信沟通，但我的主要语言是{language}，也就是您账户中设置的语言。',
    'zh-Hant': '我可以藉由翻譯用任何語言與您簡訊溝通，但我的主要語言是{language}，也就是您帳戶中設定的語言。',
    hy: 'Կարող եմ թարգմանության միջոցով գրել Ձեզ ցանկացած լեզվով, բայց իմ հիմնական լեզուն {language}-ն է՝ այն, որը նշված է Ձեր հաշվում։',
    tl: 'Makakapag-text ako sa inyo sa anumang wika gamit ang pagsasalin, pero ang pangunahing wika ko ay {language}, ang nakatakda sa inyong account.',
    vi: 'Tôi có thể nhắn tin với bạn bằng bất kỳ ngôn ngữ nào nhờ dịch thuật, nhưng ngôn ngữ chính của tôi là {language}, ngôn ngữ đã cài đặt cho tài khoản của bạn.',
  },
  // Reply to HELP. Carriers expect a help message that names the service and explains how to stop.
  help: {
    en: '{company} maintenance line. Reply with your problem and we will take care of it. Reply STOP to stop texts. For emergencies, call 911.',
    es: 'Línea de mantenimiento de {company}. Responda con su problema y nos encargamos. Responda STOP para dejar de recibir mensajes. En caso de emergencia, llame al 911.',
    ko: '{company} 정비 문의 번호입니다. 문제를 답장으로 보내주시면 처리해 드립니다. 문자 수신을 중단하려면 STOP을 보내세요. 응급 상황에는 911에 전화하세요.',
    'zh-Hans': '{company}维修热线。请回复您遇到的问题，我们会处理。回复STOP可停止接收短信。紧急情况请拨打911。',
    'zh-Hant': '{company}維修專線。請回覆您遇到的問題，我們會處理。回覆STOP可停止接收簡訊。緊急情況請撥打911。',
    hy: '{company}-ի սպասարկման գիծ։ Պատասխանեք Ձեր խնդրով, և մենք կզբաղվենք։ Հաղորդագրություններ դադարեցնելու համար գրեք STOP։ Արտակարգ իրավիճակներում զանգահարեք 911։',
    tl: 'Maintenance line ng {company}. I-reply ang inyong problema at aasikasuhin namin. I-reply ang STOP para huminto ang mga text. Sa emergency, tumawag sa 911.',
    vi: 'Đường dây bảo trì của {company}. Hãy trả lời bằng vấn đề của bạn, chúng tôi sẽ xử lý. Trả lời STOP để ngừng nhận tin nhắn. Trường hợp khẩn cấp, hãy gọi 911.',
  },
};

export const TEMPLATE_KEYS = Object.keys(TEXT);
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const pick = (key, lang) => TEXT[key][normalizeLanguage(lang)] || TEXT[key].en;
const nativeName = (l) => (l === 'es' ? 'español' : LANGUAGES.find((x) => x.code === normalizeLanguage(l))?.native || 'English');

export const T = {
  askIdentity: (l) => pick('askIdentity', l),
  identityHold: (l) => pick('identityHold', l),
  compensation: (l) => pick('compensation', l),
  proceedAck: (l) => pick('proceedAck', l),
  updateAck: (l) => pick('updateAck', l),
  liabilitySafe: (l) => pick('liabilitySafe', l),
  scheduled: (l, vendor, when) => fill(pick('scheduled', l), { vendor, when }),
  resolved: (l) => pick('resolved', l),
  closedNoVerify: (l) => pick('closedNoVerify', l),
  translateNote: (l) => fill(pick('translateNote', l), { language: nativeName(l) }),
  help: (l, company) => fill(pick('help', l), { company }),
};



/** Phrases the AI must never send a tenant (money promises, fault). Matching sentences are removed. */
const LIABILITY = [
  /\b(we|i)('ll| will|'re going to| are going to)?\s*(pay|cover|reimburse|refund|compensate|credit|waive|reduce)\b/i,
  /\b(rent|payment)\s+(credit|reduction|discount|refund|abatement)\b/i,
  /\b(reimburse|reimbursement|refund|compensat\w+|make it up to you)\b/i,
  /\b(our|my|the (landlord|owner|management|company)'s)\s+(fault|mistake|responsibility|negligence)\b/i,
  /\bwe('re| are)\s+(responsible|liable|at fault|to blame)\b/i,
  /\b(it'?s|that'?s|this is)\s+(on us|our (fault|bad|mistake))\b/i,
  /\b(pagaremos|cubriremos|reembols\w+|compensaci\w+|devolver\w* (el )?dinero|cr[eé]dito en (la )?renta|descuento en (la )?renta|nuestra culpa|somos responsables|es nuestra responsabilidad)\b/i,
];
export const violatesLiability = (s) => LIABILITY.some((re) => re.test(s));

/** Drops any sentence that promises money or admits fault; falls back to a neutral line if nothing is left. */
export function sanitizeTenantReply(text, lang) {
  const sentences = String(text || '').match(/[^.!?¿¡]+[.!?]*\s*/g) || [];
  const kept = sentences.filter((s) => !violatesLiability(s)).join('').trim();
  return kept || T.liabilitySafe(lang);
}

/** Detects a tenant asking for money, credits, or blame (so the human gets flagged). */
export const COMPENSATION_ASK =
  /\b(compensat\w+|reimburs\w+|refund|rent (credit|reduction|discount|break)|(reduce|lower|knock off|credit|waive) (my|the) rent|pay (me|for (my|the) (damage|hotel|stay|food|stuff|things))|(owe|owes) me|sue|lawyer|attorney|hotel (room|stay)|my (stuff|things|belongings|furniture|clothes) (is|are|got|were) (ruined|damaged|destroyed)|damages|reembols\w+|compensaci\w+|descuento en (la |mi )?renta|cr[eé]dito en (la |mi )?renta|abogado|me deben|pagar los da[ñn]os)\b/i;

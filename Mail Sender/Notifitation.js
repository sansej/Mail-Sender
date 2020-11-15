// #sansej_3000
// @OnlyCurrentDoc

// Приведенный выше комментарий предписывает Apps Script ограничить объем доступа
// к файлам для этого дополнения. Он указывает, что это дополнение будет пытаться
// только читать или изменять файлы, в которых используется это дополнение,
// а не все файлы пользователя. Сообщение запроса авторизации, представленное пользователям,
// будет отражать эту ограниченную область.

// Глобальная константа String, содержащая заголовок дополнения. Это используется
//для идентификации надстройки в уведомлениях по электронной почте.
var ADDON_TITLE = 'NTC Notifications';
var NOTICE = ' ';



function onOpen(e) { // Добавляет пользовательское меню в активную форму для отображения боковой панели надстройки.
  FormApp.getUi()
      .createAddonMenu()
      .addItem('Настройки', 'showSidebar')
      .addItem('Информация', 'showAbout')
//      .addItem('Экспорт', 'showExport')
      .addToUi();
}



function onInstall(e) { // Запускается, когда дополнение установлено.
  onOpen(e);
}



function showSidebar() {
  var ui = HtmlService.createHtmlOutputFromFile('Sidebar')
      .setWidth(620)
      .setHeight(800);
  FormApp.getUi().showModalDialog (ui, 'Mail sender');
}



function showAbout() {
  var ui = HtmlService.createHtmlOutputFromFile('About')
      .setWidth(420)
      .setHeight(400);
  FormApp.getUi().showModalDialog(ui, 'Внимание!');
}



function showExport() {
  var ui = HtmlService.createHtmlOutputFromFile('Export')
      .setWidth(410)
      .setHeight(420);
  FormApp.getUi().showModalDialog(ui, 'Экспорт');
}



function saveSettings(settings) { // Сохраните настройки боковой панели в свойствах этой формы и при необходимости обновите триггер onFormSubmit.
  PropertiesService.getDocumentProperties().setProperties(settings);
  adjustFormSubmitTrigger();
}

//-----------------------------------------------------------getSettings-------------------------------------------------------------------

function getSettings() {
  var settings = PropertiesService.getDocumentProperties().getProperties();
  if (!settings.creatorEmail) {// Используйте электронную почту по умолчанию, если электронная почта автора еще не была предоставлена.
    settings.creatorEmail = Session.getEffectiveUser().getEmail();
  }
  var form = FormApp.getActiveForm(); // Получить элементы текстового поля в форме, для создания списка из вопросов форы (названия и идентификаторы).
  var textItems = form.getItems(FormApp.ItemType.TEXT);
  settings.textItems = [];
  for (var i = 0; i < textItems.length; i++) {
    settings.textItems.push({
      title: textItems[i].getTitle(),
      id: textItems[i].getId()
    });
  }
  return settings;
}

//--------------------------------------------------------тригеры--------------------------------------------------------------------------------

function adjustFormSubmitTrigger() {
  let form = FormApp.getActiveForm();
  let triggers = ScriptApp.getUserTriggers(form);
  let dateTriggers = ScriptApp.getProjectTriggers();
  let settings = PropertiesService.getDocumentProperties();
  let triggerNeeded = settings.getProperty('creatorNotify') == 'true' ||  settings.getProperty('respondentNotify') == 'true';
  let dateTriggerNeeded = settings.getProperty('datetimeNotify') == 'true' ;
  let openDate = settings.getProperty('datetimeOpen');
  let closeDate = settings.getProperty('datetimeClose');
  let existingTrigger = null;
  for (let i = 0; i < triggers.length; i++) {   // Создайте новый триггер, если требуется; удалить существующий триггер, если он не нужен.
    if (triggers[i].getEventType() == ScriptApp.EventType.ON_FORM_SUBMIT) {
      existingTrigger = triggers[i];
      break;
    }
  }
  if (triggerNeeded && !existingTrigger) {
     ScriptApp.newTrigger('respondToFormSubmit').forForm(form).onFormSubmit().create();
  }
  else if (!triggerNeeded && existingTrigger) {
    ScriptApp.deleteTrigger(existingTrigger);
  }
//-------------------------------------------------
  if (!dateTriggerNeeded){ //если ТАЙМЕР ОТКЛЮЧЕН
    for (let i = 0; i < dateTriggers.length; i++) {
      if (dateTriggers[i].getEventType() == ScriptApp.EventType.CLOCK) {
        ScriptApp.deleteTrigger(dateTriggers[i]);
      }
    }
  }
  if (dateTriggerNeeded) //если ТАЙМЕР ВКЛЮЧЕН
  {
    for (let i = 0; i < dateTriggers.length; i++) {
      if (dateTriggers[i].getEventType() == ScriptApp.EventType.CLOCK) {
        ScriptApp.deleteTrigger(dateTriggers[i]);
      }
    }
    ScriptApp.newTrigger("open_Form").timeBased().at(parseDate(openDate)).create();
    ScriptApp.newTrigger("close_Form").timeBased().at(parseDate(closeDate)).create();
  }
}

//-----------------------------------------------------------обработка тригеров------------------------------------------------------------------

function respondToFormSubmit(e) {
//  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
//  var stepResponse = settings.getProperty('stepResponse');
//  var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  if (ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationStatus() == ScriptApp.AuthorizationStatus.REQUIRED) {
    sendReauthorizationRequest();
  } else {
    if (settings.getProperty('responscountNotify') == 'true' && FormApp.getActiveForm().getResponses().length >= PropertiesService.getDocumentProperties().getProperty('stepResponse')) { // Форма закрыта, если включена опция и лимит участников достигнут
      close_Form();
      sendRespondentCountNotification();
    }
    if (settings.getProperty('creatorNotify') == 'true') { // Если уведомление включено, создает и отправляет уведомление создателю.
      sendCreatorNotification();
    }
    if (settings.getProperty('respondentNotify') == 'true' && MailApp.getRemainingDailyQuota() > 0) {   // Создайте новый триггер, если требуется; удалить существующий триггер, если он не нужен.
      sendRespondentNotification(e.response);
    }
  }
}

//----------------------------------------------------------необходима авторизация----------------------------------------------------------------

function sendReauthorizationRequest() {
  var settings = PropertiesService.getDocumentProperties();
  var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  var lastAuthEmailDate = settings.getProperty('lastAuthEmailDate');
  var today = new Date().toDateString();
  if (lastAuthEmailDate != today) {
    if (MailApp.getRemainingDailyQuota() > 0) {
      var template = HtmlService.createTemplateFromFile('AuthorizationEmail');
      template.url = authInfo.getAuthorizationUrl();
      template.notice = NOTICE;
      var message = template.evaluate();
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
                        'Требуется Авторизация',
                        message.getContent(),
                        {name: ADDON_TITLE,
                         htmlBody: message.getContent()
                        });
    }
    settings.setProperty('lastAuthEmailDate', today);
  }
}

//------------------------------------------------------ответ создателю---------------------------------------------------------------------------

function sendCreatorNotification() {
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  var responseStep = settings.getProperty('responseStep');
  responseStep = responseStep ? parseInt(responseStep) : 10;
  if (form.getResponses().length % responseStep == 0) {
    var addresses = settings.getProperty('creatorEmail').split(',');
    if (MailApp.getRemainingDailyQuota() > addresses.length) {
      var template = HtmlService.createTemplateFromFile('CreatorNotification');
      template.sheet = DriveApp.getFileById(form.getDestinationId()).getUrl();
      template.summary = form.getSummaryUrl();
      template.responses = form.getResponses().length;
      template.title = form.getTitle();
      template.responseStep = responseStep;
      template.formUrl = form.getEditUrl();
      template.notice = NOTICE;
      var message = template.evaluate();
      MailApp.sendEmail(settings.getProperty('creatorEmail'),
          form.getTitle() + 'Новые ответы',
          message.getContent(), {
            name: ADDON_TITLE,
            htmlBody: message.getContent()
          });
    }
  }
}

//-----------------------------------------------------------ОТВЕТ РЕСПОНДЕНТУ--------------------------------------------------------------------

function sendRespondentNotification(response) { // Отправляет сообщения участникам по электронной почте.
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  let val = settings.getProperties().mapNotify;
  let picture_NTCFunctional = '137oHglvglvSfxGlhKnjt3rogHbSj1-rq';
  let imageBlob = DriveApp.getFileById(picture_NTCFunctional).getBlob().setName("image");
  var emailId = settings.getProperty('respondentEmailItemId');
  var emailItem = form.getItemById(parseInt(emailId));
  var respondentEmail = response.getResponseForItem(emailItem).getResponse();
  if (respondentEmail)
  {
    var template = HtmlService.createTemplateFromFile('RespondentNotification');
    template.paragraphs = settings.getProperty('responseText').split('\n');
    template.notice = NOTICE;
    template.url = 'https://goo.gl/maps/9Q8SueWsR7mgfmjD9';
    template.mapNotis = 'Карта является ссылкой на Google карту с отмеченой локацией.';
    var message = template.evaluate();
  if (val === 'true'){
    let mapBlob = Maps.newStaticMap().setSize(800, 400).setCenter(settings.getProperty('pointMap')).addMarker(settings.getProperty('pointMap')).getBlob().setName("map");
    GmailApp.sendEmail(respondentEmail,settings.getProperty('responseSubject'),message.getContent(),
                       {name: form.getTitle(),
                        inlineImages:{logo: imageBlob, map: mapBlob}, //прикрепляет картинку и карту
                        htmlBody: message.getContent()});
  }
  else {
    GmailApp.sendEmail(respondentEmail,settings.getProperty('responseSubject'),message.getContent(),
                       {name: form.getTitle(),
                        inlineImages:{logo: imageBlob}, //прикрепляет картинку
                        htmlBody: message.getContent()});
  }
  }
}

//------------------------------------------------------ЛИМИТ ВЫШЕЛ------------------------------------------------------------------------------

function sendRespondentCountNotification() { // Отправляет электронное письмо если лимит участников вышел.
   var form = FormApp.getActiveForm();
   var settings = PropertiesService.getDocumentProperties();
   var addresses = settings.getProperty('creatorEmail').split(',');
   if (MailApp.getRemainingDailyQuota() > addresses.length) {
     var template = HtmlService.createTemplateFromFile('RespondentCountNotification');
     template.sheet = DriveApp.getFileById(form.getDestinationId()).getUrl();
     template.summary = form.getSummaryUrl();
     template.responses = form.getResponses().length;
     template.title = form.getTitle();
     template.stepResponse = settings.getProperty('stepResponse');
     template.formUrl = form.getEditUrl();
     template.notice = NOTICE;
     var message = template.evaluate();
     MailApp.sendEmail(settings.getProperty('creatorEmail'),
                       form.getTitle() + 'Форма закрыта',
                       message.getContent(),
       {name: ADDON_TITLE,
         htmlBody: message.getContent()
     });
   }
}

//-------------------------------------------------------------ИНФОРМИРОВАНИЕ СОЗДАТЕЛЯ------------------------------------------------------------------

function informUser(subject) { //Отправить письмо владельцу формы при изменении статуса формы
    var formURL = FormApp.getActiveForm().getPublishedUrl();
    MailApp.sendEmail(Session.getActiveUser().getEmail(), subject, formURL);
}

//--------------------------------------------------------------ОТКРЫТЬ ФОРМУ----------------------------------------------------------------------------

function open_Form() { //Открывает форму и принимает ответы
  let form = FormApp.getActiveForm();
  form.setAcceptingResponses(true); // Определяет, принимает ли форма в настоящее время ответы.
  informUser("Ваша форма Google принимает ответы");
  let openForm = "Регистрация на NTC FUNCTIONAL открыта: https://docs.google.com/forms/d/e/1FAIpQLSeyte5iF8mFWT3X0Y6Vuc-jYX20UtIGVqmOMyGNGEEPrnFRdA/viewform";
  doGet(openForm);
}

//------------------------------------------------------------ЗАКРЫТЬ ФОРМУ--------------------------------------------------------------------------------

function close_Form() { //Закрывает форму и не принимает ответы
  let form = FormApp.getActiveForm();
  form.setAcceptingResponses(false);
  let triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  informUser("Ваша форма Google больше не принимает ответы");
  let closeForm = "Регистрация закрыта, ответы больше не принимаются. Сообщение о месте и времени проведения тренировки отправлены на электронную почту всем зарегистрированным. Если вы не успели зарегистрироваться, оставьте коментарий под данным постом.";
  doGet(closeForm);

}

//------------------------------------------------------------parseDate----------------------------------------------------------------------

function parseDate(d) { /* Разбор даты для создания триггеров на основе времени */
  return new Date(d.substr(0, 4), d.substr(5, 2) - 1, d.substr(8, 2), d.substr(11, 2), d.substr(14, 2), d.substr(17, 2)); // 2020.07.30 18:54:26
  // d.substr(0, 4)       --->   2020 - год
  // d.substr(5, 2) - 1   --->   07   - месяц
  // d.substr(8, 2)       --->   30   - день
  // d.substr(11, 2)      --->   18   - час
  // d.substr(14, 2)      --->   54   - минута
  // d.substr(17, 2)      --->   26   - секунда
}



function test (){
  let form = FormApp.getActiveForm();
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {
  if (triggers[i].getTriggerSource() == ScriptApp.TriggerSource.CLOCK) {
    Logger.log(triggers[i].getUniqueId() + " source is clock");
    Logger.log(triggers[i].getHandlerFunction())
  } else if (triggers[i].getTriggerSource() == ScriptApp.TriggerSource.SPREADSHEETS) {
    Logger.log(triggers[i].getUniqueId() + " source is spreadsheets");
  }
}
}

function ook() {
  let settings = PropertiesService.getDocumentProperties().getProperties();
Logger.log(settings)
  let val = settings.mapNotify;
  Logger.log(val)

}
//function setWebhook() {
//var url = telegramUrl + "/setWebhook?url=" + webAppUrl;
//var response = UrlFetchApp.fetch(url);
//}
//
//function sendMessage(chat_id, text) {
//var url = telegramUrl + "/sendMessage?chat_id=" + chat_id + "&text="+ text;
//var response = UrlFetchApp.fetch(url);
//Logger.log(response.getContentText());
//}
//
//function doPost(e) {
//var contents = JSON.parse(e.postData.contents);
//var chat_id = contents.message.from.id;
//var text = "Beep boop bop, message received.";
//
//sendMessage(chat_id,text)
//}

//-----------------------------------------------------------------doGet----------------------------------------------------------------------

function doGet(text) {
const SANSEJ_BOT = '1335310061:AAHDCqeMrkOaN5h7lkcIbaU13voNWRnNHZ4'
const CURRENT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwiy0dxYg5nIi0cgfOfgvQs5zc9YxE-bvgIDrYclTG6-3ohqUY/exec'
const NRC_CHAT_ID = '-1001276285149'
const HTTPS = 'https://api.telegram.org/bot'
const NRC_BOT = '1453141894:AAGFJ6onKvz1C7IMyd4F8Z8fGclBeE5P3XY'
const NTCYoga_BOT = '1476900325:AAEeIljAqV1iUPWYUV0P246FF94DFNCJ2GY'
const NTCFunctional_BOT = '1432536828:AAFGL6DeAdOXBqTFCJew3kkHdjp0-SK1fy8'

let telegramUrl = "https://api.telegram.org/bot" + NTCFunctional_BOT;
let MailSender = "https://script.google.com/macros/s/AKfycbyGlsL9W7VG413SHoJ6LSNxs_uW8ZtbLY7h0hk9oOruxmZlizg/exec";
let url = telegramUrl + "/sendMessage?chat_id=" + "@NRC_Channel" + "&text="+ text;
let response = UrlFetchApp.fetch(url);
}

function sendTest() { // Отправляет сообщения участникам по электронной почте.
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  let val = settings.getProperties().mapNotify;
//  let val = property.mapNotify;
  let picture_NTCFunctional = '137oHglvglvSfxGlhKnjt3rogHbSj1-rq';
  let imageBlob = DriveApp.getFileById(picture_NTCFunctional).getBlob().setName("image");

  var respondentEmail = 'sansej5000@gmail.com';

    var template = HtmlService.createTemplateFromFile('RespondentNotification');
    template.paragraphs = settings.getProperty('responseText').split('\n');
    template.notice = NOTICE;
    template.url = 'https://goo.gl/maps/9Q8SueWsR7mgfmjD9';
    template.mapNotis = 'Карта является ссылкой на Google карту с отмеченой локацией.';
    var message = template.evaluate();
  if (val === 'true'){
    let mapBlob = Maps.newStaticMap().setSize(800, 400).setCenter(settings.getProperty('pointMap')).addMarker(settings.getProperty('pointMap')).getBlob().setName("map");
    GmailApp.sendEmail(respondentEmail,settings.getProperty('responseSubject'),message.getContent(),
                       {name: form.getTitle(),
                        inlineImages:{logo: imageBlob, map: mapBlob}, //прикрепляет картинку и карту
                        htmlBody: message.getContent()});
  }
  else {
    GmailApp.sendEmail(respondentEmail,settings.getProperty('responseSubject'),message.getContent(),
                       {name: form.getTitle(),
                        inlineImages:{logo: imageBlob}, //прикрепляет картинку
                        htmlBody: message.getContent()});
  }

}

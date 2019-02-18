/*
 * Script for Google Ads to check links for bad responses or errors in the content. 
 *
 * Checks HTTP response codes for errors and redirects, 
 * and checks the response body for user-defined phrases.
 *
 * Sends an email notification detailing any issues with link health.
 *
 * Version 1.0.1
 * Google Ads Script built and maintained by Roar Digital 
 * https://www.roardigital.co.uk
 *
 */


var options = {
  // http response codes to flag as errors
  errorCodes: [/4[0-9]{2}/, /5[0-9]{2}/],

  // http response codes to warn about (redirects)
  warnCodes: [/3[0-9]{2}/],

  // error phrases to flag is in the page response
  errorPhrases: ["Liquid error:", " liquid error ", " err "],

  // status of the ad/keyword, can be enabled or paused. Options - "ENABLED" , "PAUSED"  , "ENABLED PAUSED"
  status: "ENABLED",

  // removes http paramaters - eg ?my_param=MY_VALUE
  removeParams: true,

  // array of email addresses to notify
  notificationRecipients: [
    //"adam.parish@roardigital.co.uk",
    "henry.mcintosh@roardigital.co.uk",
    //"amy.tate@roardigital.co.uk",
    //"charlie.phillips@roardigital.co.uk",
    //"james@roardigital.co.uk",
    //"george.hill@roardigital.co.uk"
  ],

  // send a notification on Mondays, even if there are no errors, just to reassure that there are no errors and the script has still run successfully. 
  sendReassuranceEmail: true
};


var urlFetchOptions = {
  muteHttpExceptions: true
}

function main() {
  var accountSelector = MccApp.accounts(); //get child accounts
  accountSelector.executeInParallel("processClientAccount", "sendSummary", null); //start account processing
}

function Results() {
  this.urls = [];
  this.badUrls = [];
  this.warnUrls = [];
  this.onPageErrors = [];
}

Results.prototype.processUrls = function () {
  for (var i = 0; i < this.urls.length; i++) {
    try {
      var url = this.urls[i];
      var fetchData = UrlFetchApp.fetch(url, urlFetchOptions);
      var responseCode = fetchData.getResponseCode();
      var responseBody = fetchData.getContentText();
      this.httpErrors(url, responseCode);
      this.httpWarnings(url, responseCode);
      this.contentErrors(url, responseBody);
    } catch (err) {
      results.badUrls.push({
        url: url,
        error: "Error - url fetch failed."
      });
    }
  }
}

Results.prototype.httpErrors = function (url, responseCode) {
  options.errorCodes.forEach(function (regex) {
    if (regex.test(responseCode.toString())) {
      error = responseCode.toString();
      this.badUrls.push({
        url: url,
        error: "HTTP Error Code - " + error,
      });
    }
  });
}

Results.prototype.httpWarnings = function (url, responseCode) {
  options.warnCodes.forEach(function (regex) {
    if (regex.test(responseCode.toString())) {
      var errorMessage = "HTTP Code - " + responseCode.toString();;
      this.warnUrls.push({
        url: url,
        error: errorMessage
      });
    }
  });
}

Results.prototype.contentErrors = function (url, responseBody) {
  var error = false;
  options.errorPhrases.forEach(function (phrase) {
    if (responseBody.indexOf(phrase) >= 0) {
      if (error) {
        error += ", " + '"' + phrase + '"';
      } else {
        error = '"' + phrase + '"';
      }
    }
  });

  if (error) {
    this.onPageErrors.push({
      url: url,
      error: "Page contains: " + error,
    });
  }
}

Results.prototype.processIterator = function (iterator) {
  while (iterator.hasNext()) {
    var current = iterator.next();
    var url = current.urls().getFinalUrl();
    if (url && options.removeParams) {
      url = url.split("?")[0];
    }
    if (url && this.urls.indexOf(url) < 0) {
      this.urls.push(url)
    }
  }
}

function processClientAccount() {
  var clientAccount = AdWordsApp.currentAccount();
  var results = new Results()
  var adsIterator = getIterator('ads');
  results.processIterator(adsIterator);
  results.processUrls()

  Logger.log("Processed " + clientAccount.getName());

  if (results.urls.length > 0) {
    return JSON.stringify({
      text: getRow(clientAccount.getName(), results),
      data: results
    });
  } else {
    return JSON.stringify({
      text: " ",
      data: results
    });
  }

}

function getIterator(type) {
  if (type !== "ads" && type !== "keywords") {
    throw "Iterator type must be 'ads' or 'keywords'!"
  }
  var condition;
  if (options.status == "ENABLED") {
    condition = "AdGroupStatus = 'ENABLED' AND CampaignStatus = 'ENABLED' AND Status = 'ENABLED'";
  } else if (options.status == 'PAUSED') {
    condition = "AdGroupStatus = 'PAUSED' OR CampaignStatus = 'PAUSED' OR Status = 'PAUSED'"
  }


  if (condition) {
    return AdWordsApp[type]().withCondition(condition).get()
  } else {
    return AdWordsApp[type]().get()
  }
}

function sendSummary(results) {
  Logger.log("All accounts processed.");
  var title = "Everything looks good! No errors found.";
  var totErrs = 0;
  var totWarns = 0;
  var totContentErrs = 0;

  var emailBody = "";
  for (var i = 0; i < results.length; i++) {
    var rowResult = JSON.parse(results[i].getReturnValue());
    emailBody += rowResult.text;
    totErrs += rowResult.data.badUrls.length;
    totWarns += rowResult.data.warnUrls.length;
    totContentErrs += rowResult.data.onPageErrors.length;
  }
  if (totErrs > 0) {
    title = "Errors found! " + totErrs + " url(s) have errors - please check ASAP.";
  } else if (totContentErrs > 0) {
    title = "Content errors found! " + totContentErrs + " url(s) have warning signs.";
  } else if (totWarns > 0) {
    title = "Warning! " + totWarns + " url(s) have warning signs.";
  }

  var today = new Date();
  var isMonday = today.getDay() === 1;
  var sendReassuranceEmail = isMonday && options.sendReassuranceEmail;
  if ( sendReassuranceEmail || totWarns > 0 || totErrs > 0 || totContentErrs > 0) {
    emailBody = getEmailHTML(emailBody, formatTitle(title));
    var subject = "Landing Page Monitor"
    MailApp.sendEmail({
      to: options.notificationRecipients.join(","),
      subject: subject,
      htmlBody: emailBody,
      replyTo: "scriptcenter@roardigital.co.uk",
      name: "Roar Digital Scripts"
    })
    Logger.log("Email sent. Script complete.")
  } else {
    Logger.log("Script complete. Nothing to report, no email sent.")
  }
}


function getEmailHTML(rows, title) {
  return "\n<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:v=\"urn:schemas-microsoft-com:vml\" xmlns:o=\"urn:schemas-microsoft-com:office:office\">\n\n<head>\n    <title></title>\n    <!--[if !mso]><!-- -->\n    <meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\">\n    <!--<![endif]-->\n    <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <style type=\"text/css\">\n        #outlook a {\n            padding: 0;\n        }\n\n        .ReadMsgBody {\n            width: 100%;\n        }\n\n        .ExternalClass {\n            width: 100%;\n        }\n\n        .ExternalClass * {\n            line-height: 100%;\n        }\n\n        body {\n            margin: 0;\n            padding: 0;\n            -webkit-text-size-adjust: 100%;\n            -ms-text-size-adjust: 100%;\n        }\n\n        table,\n        td {\n            border-collapse: collapse;\n            mso-table-lspace: 0pt;\n            mso-table-rspace: 0pt;\n        }\n\n        img {\n            border: 0;\n            height: auto;\n            line-height: 100%;\n            outline: none;\n            text-decoration: none;\n            -ms-interpolation-mode: bicubic;\n        }\n\n        p {\n            display: block;\n            margin: 13px 0;\n        }\n    </style>\n    <!--[if !mso]><!-->\n    <style type=\"text/css\">\n        @media only screen and (max-width:480px) {\n            @-ms-viewport {\n                width: 320px;\n            }\n\n            @viewport {\n                width: 320px;\n            }\n        }\n    </style>\n    <!--<![endif]-->\n    <!--[if mso]><xml>  <o:OfficeDocumentSettings>    <o:AllowPNG/>    <o:PixelsPerInch>96</o:PixelsPerInch>  </o:OfficeDocumentSettings></xml><![endif]-->\n    <!--[if lte mso 11]><style type=\"text/css\">  .outlook-group-fix {    width:100% !important;  }</style><![endif]-->\n    <!--[if !mso]><!-->\n    <link href=\"https://fonts.googleapis.com/css?family=Lato\" rel=\"stylesheet\" type=\"text/css\">\n    <link href=\"https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700\" rel=\"stylesheet\" type=\"text/css\">\n    <style type=\"text/css\">\n        @import url(https: //fonts.googleapis.com/css?family=Lato);  @import url(https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700);\n    </style>\n    <!--<![endif]-->\n    <style type=\"text/css\">\n        @media only screen and (min-width:480px) {\n            .mj-column-per-100 {\n                width: 100% !important;\n            }\n\n            .mj-column-per-50 {\n                width: 50% !important;\n            }\n        }\n    </style>\n</head>\n\n<body style=\"background: #FFFFFF;\">\n    <div class=\"mj-container\" style=\"background-color:#FFFFFF;\">\n        <!--[if mso | IE]>      <table role=\"presentation\" border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"600\" align=\"center\" style=\"width:600px;\">        <tr>          <td style=\"line-height:0px;font-size:0px;mso-line-height-rule:exactly;\">      <![endif]-->\n        <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#000b29;font-size:0px;width:100%;\"\n            border=\"0\">\n            <tbody>\n                <tr>\n                    <td>\n                        <div style=\"margin:0px auto;max-width:600px;\">\n                            <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-size:0px;width:100%;\"\n                                align=\"center\" border=\"0\">\n                                <tbody>\n                                    <tr>\n                                        <td style=\"text-align:center;vertical-align:top;direction:ltr;font-size:0px;padding:0px 0px 0px 0px;\">\n                                            <!--[if mso | IE]>      <table role=\"presentation\" border=\"0\" cellpadding=\"0\" cellspacing=\"0\">        <tr>          <td style=\"vertical-align:top;width:600px;\">      <![endif]-->\n                                            <div class=\"mj-column-per-100 outlook-group-fix\" style=\"vertical-align:top;display:inline-block;direction:ltr;font-size:13px;text-align:left;width:100%;\">\n                                                <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\"\n                                                    border=\"0\">\n                                                    <tbody>\n                                                        <tr>\n                                                            <td style=\"word-wrap:break-word;font-size:0px;\">\n                                                                <div style=\"font-size:1px;line-height:50px;white-space:nowrap;\">&#xA0;</div>\n                                                            </td>\n                                                        </tr>\n                                                        <tr>\n                                                            <td style=\"word-wrap:break-word;font-size:0px;padding:0px 20px 0px 20px;\"\n                                                                align=\"center\">\n                                                                <div style=\"cursor:auto;color:#FFFFFF;font-family:Lato, Tahoma, sans-serif;font-size:12px;line-height:22px;text-align:center;\">\n                   " + title + "                                                 <h1 style=\"font-family: &apos;Cabin&apos;, sans-serif; color: #FFFFFF; font-size: 32px; line-height: 100%;\">Roar\n                                                                        Digital</h1>\n                                                                </div>\n                                                            </td>\n                                                        </tr>\n                                                        <tr>\n                                                            <td style=\"word-wrap:break-word;font-size:0px;padding:10px 25px;padding-top:10px;padding-bottom:10px;padding-right:10px;padding-left:10px;\">\n                                                                <p style=\"font-size:1px;margin:0px auto;border-top:1px solid #FAAF08;width:100%;\"></p>\n                                                                <!--[if mso | IE]><table role=\"presentation\" align=\"center\" border=\"0\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-size:1px;margin:0px auto;border-top:1px solid #FAAF08;width:100%;\" width=\"600\"><tr><td style=\"height:0;line-height:0;\"> </td></tr></table><![endif]-->\n                                                            </td>\n                                                        </tr>\n                                                        <tr>\n                                                            <td style=\"word-wrap:break-word;font-size:0px;padding:0px 20px 0px 20px;\"\n                                                                align=\"center\">\n                                                                <div style=\"cursor:auto;color:#FFFFFF;font-family:Lato, Tahoma, sans-serif;font-size:12px;line-height:22px;text-align:center;\">\n                                                                     <h1 style=\"font-family: &apos;Cabin&apos;, sans-serif; color: #FFFFFF; font-size: 32px; line-height: 100%;\">Landing Page Monitor</h1>\n                                                                </div>\n                                                            </td>\n                                                        </tr>\n                                                        <tr>\n                                                            <td style=\"word-wrap:break-word;font-size:0px;\">\n                                                                <div style=\"font-size:1px;line-height:50px;white-space:nowrap;\">&#xA0;</div>\n                                                            </td>\n                                                        </tr>\n                                                    </tbody>\n                                                </table>\n                                            </div>\n                                            <!--[if mso | IE]>      </td></tr></table>      <![endif]-->\n                                        </td>\n                                    </tr>\n                                </tbody>\n                            </table>\n                        </div>\n                    </td>\n                </tr>\n            </tbody>\n        </table>\n        <!--[if mso | IE]>      </td></tr></table>      <![endif]-->\n        <!--[if mso | IE]>      <table role=\"presentation\" border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"600\" align=\"center\" style=\"width:600px;\">        <tr>          <td style=\"line-height:0px;font-size:0px;mso-line-height-rule:exactly;\">      <![endif]-->\n        <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-size:0px;width:100%;\" border=\"0\">\n            <tbody>\n                <tr>\n                    <td>\n                        <div style=\"margin:0px auto;max-width:600px;\">\n                            <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"font-size:0px;width:100%;\"\n                                align=\"center\" border=\"0\">\n                                <tbody>\n                                    " + rows + "\n                                </tbody>\n                            </table>\n                        </div>\n                    </td>\n                </tr>\n            </tbody>\n        </table>\n        <!--[if mso | IE]>      </td></tr></table>      <![endif]-->\n    </div>\n</body>\n\n</html>\n";
}

function getRow(clientName, results) {
  var summary = "Of the " + results.urls.length + " urls checked, " + results.badUrls.length + " contain errors, " + results.warnUrls.length + " have warning signs, and " + results.onPageErrors.length + " have content errors.";
  var the_results = "";
  results.badUrls.forEach(function (urlObj) {
    the_results += "<a title=\"Error\" href=\"" + urlObj.url + "\" style=\"color: #d80d0d;\">" + urlObj.url + "</a> <br /> " + urlObj.error + "  <br /> <br /> ";
  });
  results.onPageErrors.forEach(function (urlObj) {
    the_results += "<a title=\"Content issue\" href=\"" + urlObj.url + "\" style=\"color: #d80d0d;\">" + urlObj.url + "</a> <br /> " + urlObj.error + "  <br /> <br /> ";
  });
  results.warnUrls.forEach(function (urlObj) {
    the_results += "<a title=\"Warning\" href=\"" + urlObj.url + "\" style=\"color: #e27600;\">" + urlObj.url + "</a> <br /> " + urlObj.error + "  <br /> <br /> ";
  });
  if (the_results.length == 0) {
    the_results = "No errors or warnings to report for this account."
  }
  return "\n\t\t<tr>\n          <td style=\"text-align:center;vertical-align:top;direction:ltr;font-size:0px;padding:35px 0px 35px 0px;\">\n          <!--[if mso | IE]>      <table role=\"presentation\" border=\"0\" cellpadding=\"0\" cellspacing=\"0\">        <tr>          <td style=\"vertical-align:top;width:300px;\">      <![endif]-->\n          <div class=\"mj-column-per-50 outlook-group-fix\" style=\"vertical-align:top;display:inline-block;direction:ltr;font-size:13px;text-align:left;width:100%;\">\n          <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\"\n          border=\"0\">\n          <tbody>\n          <tr>\n          <td style=\"word-wrap:break-word;font-size:0px;padding:0px 20px 0px 20px;\"\n          align=\"left\">\n          <div style=\"cursor:auto;color:#000000;font-family:Lato, Tahoma, sans-serif;font-size:12px;line-height:22px;text-align:left;\">\n          <h2 style=\"color: #757575; line-height: 100%;\">" + clientName + "</h2>\n          <p>" + summary + "</p>\n          <p></p>\n          </div>\n          </td>\n          </tr>\n          </tbody>\n          </table>\n          </div>\n          <!--[if mso | IE]>      </td><td style=\"vertical-align:top;width:300px;\">      <![endif]-->\n          <div class=\"mj-column-per-50 outlook-group-fix\" style=\"vertical-align:top;display:inline-block;direction:ltr;font-size:13px;text-align:left;width:100%;\">\n          <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\"\n          border=\"0\">\n          <tbody>\n          <tr>\n          <td style=\"word-wrap:break-word;font-size:0px;padding:0px 20px 0px 20px;\"\n          align=\"left\">\n          <div style=\"cursor:auto;color:#000000;font-family:Ubuntu, Helvetica, Arial, sans-serif;font-size:12px;line-height:22px;text-align:left;\">\n          <p>\n" + the_results + "</p>\n          </div>\n          </td>\n          </tr>\n          </tbody>\n          </table>\n          </div>\n          <!--[if mso | IE]>      </td></tr></table>      <![endif]-->\n          </td>\n\t\t</tr>\n";
}

function formatTitle(title) {
  var returnVal = '<div style="display: none; max-height: 0px; overflow: hidden;">' + title + '</div> <div style="display: none; max-height: 0px; overflow: hidden;"> &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>';
  return returnVal;
}
# Landing Page Monitoring Script


### Script for Google Ads to check landing pages for bad HTTP response codes, and errors in the content. 

Checks HTTP response codes for errors and redirects, and checks the response body for user-defined error messages. For example, some of our client sites use Shopify's Liquid templating language, so we check for "Liquid error:" in the response body, so we know if something breaks in the template. 

This script sends an email notification detailing any issues with link health.
Recommended scheduling is to run daily, though it will only email you if there is an issue. 
Optionally, it will send an email on Mondays, just to reassure you that the script ran successfully and found no errors. 

---

## Options

- HTTP response codes to flag as errors (regex array)
- HTTP response codes to warn about (regex array)
- Error phrases to flag in the page (string array)
- Status of the ads/keywords to check, can be enabled or paused ( string - one of: "ENABLED" , "PAUSED"  , "ENABLED PAUSED" )
- Option to remove HTTP query parameters from final url (boolean)
- Email addresses to notify (string array)
- Send reassurance email on Mondays (boolean)


---

## Source

Version 1.0.1

Google Ads Script built and maintained by Roar Digital 

https://www.roardigital.co.uk

'use strict';

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'locales');

let currentLocale = 'en';
let translations = {};

const availableLocales = ['en', 'zh'];

function loadTranslations(locale) {
  const filePath = path.join(localesDir, `${locale}.json`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    translations = JSON.parse(content);
    currentLocale = locale;
  } catch (err) {
    console.error(`Failed to load translations for ${locale}:`, err);
    if (locale !== 'en') {
      loadTranslations('en');
    }
  }
}

function t(key, params) {
  let value = translations[key];
  if (value === undefined) {
    return key;
  }
  if (params) {
    Object.keys(params).forEach((paramKey) => {
      value = value.replace(`{${paramKey}}`, params[paramKey]);
    });
  }
  return value;
}

function setLocale(locale) {
  if (availableLocales.includes(locale)) {
    loadTranslations(locale);
  }
}

function getLocale() {
  return currentLocale;
}

function getAvailableLocales() {
  return availableLocales;
}

loadTranslations(currentLocale);

module.exports = { t, setLocale, getLocale, getAvailableLocales, loadTranslations };

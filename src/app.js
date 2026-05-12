'use strict';

const Store = require('electron-store');
const store = new Store();
const { Howl } = require('howler');
const { shell, remote, ipcRenderer } = require('electron');
const glob = require('glob');
const iohook = require('iohook');
const path = require('path');
const { platform } = process;
const remapper = require('./utils/remapper');
const i18n = require('./i18n');

const savedLocale = store.get('mechvibes-locale') || 'en';
i18n.setLocale(savedLocale);

const MV_KEYBOARD_PACK_LSID = 'mechvibes-pack';
const MV_MOUSE_PACK_LSID = 'mechvibes-mousepack';
const MV_KEY_VOL_LSID = 'mechvibes-volume-keyboard';
const MV_MOUSE_VOL_LSID = 'mechvibes-volume-mouse';

const KEYBOARD_CUSTOM_PACKS_DIR = remote.getGlobal('keyboardcustom_dir');
const KEYBOARD_OFFICIAL_PACKS_DIR = path.join(__dirname, 'sounds/keys');
const MOUSE_CUSTOM_PACKS_DIR = remote.getGlobal('mousecustom_dir');
const MOUSE_OFFICIAL_PACKS_DIR = path.join(__dirname, 'sounds/mouse');
const APP_VERSION = remote.getGlobal('app_version');

let current_keyboard_pack = null;
let current_mouse_pack = null;
let current_sound_key = null;
let current_mouse_down = null;
let is_muted = store.get('mechvibes-muted') || false;
let is_keyup = store.get('mechvibes-keyup') || false;
let is_mousesounds = store.get('mechvibes-mouse') || true;
let is_random = store.get('mechvibes-random') || false;
let keyboardpacks = [];
let mousepacks = [];
const all_sound_files = {};

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = i18n.t(key);
  });
}

async function loadPacks(status_display_elem, app_body) {
  status_display_elem.innerHTML = i18n.t('app.loading');

  const official_packs = await glob.sync(KEYBOARD_OFFICIAL_PACKS_DIR + '/*/');
  const custom_packs = await glob.sync(KEYBOARD_CUSTOM_PACKS_DIR + '/*/');
  const mouse_official_packs = await glob.sync(MOUSE_OFFICIAL_PACKS_DIR + '/*/');
  const mouse_custom_packs = await glob.sync(MOUSE_CUSTOM_PACKS_DIR + '/*/');
  const folders = [...official_packs, ...custom_packs];
  const mouse_folders = [...mouse_official_packs, ...mouse_custom_packs];

  var fucked = false

  folders.map((folder) => {
      try{
        const is_custom = folder.indexOf('mechvibes_custom') > -1 ? true : false;
        const splited = folder.split('/');
        const folder_name = splited[splited.length - 2];
        const config_file = `${folder.replace(/\/$/, '')}/config.json`;
        const { name, includes_numpad, sound = '', defines, key_define_type = 'single', compatibility = false } = require(config_file);
        const pack_data = {
          pack_id: `${is_custom ? 'custom' : 'default'}-${folder_name}`,
          group: is_custom ? 'Custom' : 'Default',
          abs_path: folder,
          key_define_type,
          compatibility,
          name,
          includes_numpad,
        };
        if (key_define_type == 'single') {
          const sound_path = `${folder}${sound}`;
          const sound_data = new Howl({ src: [sound_path], sprite: keycodesRemap(defines) });
          Object.assign(pack_data, { sound: sound_data });
          all_sound_files[pack_data.pack_id] = false;
          sound_data.once('load', function () {
            all_sound_files[pack_data.pack_id] = true;
            checkIfAllSoundLoaded(status_display_elem, app_body);
          });
        } else {
          const sound_data = {};
          Object.keys(defines).map((kc) => {
            if (defines[kc]) {
              const sound_path = `${folder}${defines[kc]}`;
              sound_data[kc] = new Howl({ src: [sound_path] });
              all_sound_files[`${pack_data.pack_id}-${kc}`] = false;
              sound_data[kc].once('load', function () {
                all_sound_files[`${pack_data.pack_id}-${kc}`] = true;
                checkIfAllSoundLoaded(status_display_elem, app_body);
              });
            }
          });
          if (Object.keys(sound_data).length) {
            Object.assign(pack_data, { sound: keycodesRemap(sound_data) });
          }
        }
        keyboardpacks.push(pack_data);
      } catch(err){fucked = true}
    });

    mouse_folders.map((folder) => {
      try{
        const is_custom = folder.indexOf('mousevibes_custom') > -1 ? true : false;
        const splited = folder.split('/');
        const folder_name = splited[splited.length - 2];
        const config_file = `${folder.replace(/\/$/, '')}/config.json`;
        const { name, sound = '', defines, key_define_type = 'single'} = require(config_file);
        const pack_data = {
          pack_id: `${is_custom ? 'custom' : 'default'}-${folder_name}`,
          group: is_custom ? 'Custom' : 'Default',
          abs_path: folder,
          key_define_type,
          name,
        };
        if (key_define_type == 'single') {
          const sound_path = `${folder}${sound}`;
          const sound_data = new Howl({ src: [sound_path], sprite: keycodesRemap(defines) });
          Object.assign(pack_data, { sound: sound_data });
          all_sound_files[pack_data.pack_id] = false;
          sound_data.once('load', function () {
            all_sound_files[pack_data.pack_id] = true;
            checkIfAllSoundLoaded(status_display_elem, app_body);
          });
        } else {
          const sound_data = {};
          Object.keys(defines).map((kc) => {
            if (defines[kc]) {
              const sound_path = `${folder}${defines[kc]}`;
              sound_data[kc] = new Howl({ src: [sound_path] });
              all_sound_files[`${pack_data.pack_id}-${kc}`] = false;
              sound_data[kc].once('load', function () {
                all_sound_files[`${pack_data.pack_id}-${kc}`] = true;
                checkIfAllSoundLoaded(status_display_elem, app_body);
              });
            }
          });
          if (Object.keys(sound_data).length) {
            Object.assign(pack_data, { sound: keycodesRemap(sound_data) });
          }
        }
        mousepacks.push(pack_data);
      } catch(err){fucked = true}
    });

  return fucked;
}


function checkIfAllSoundLoaded(status_display_elem, app_body) {
  Object.keys(all_sound_files).map((key) => {
    if (!all_sound_files[key]) {
      return false;
    }
  });
  status_display_elem.innerHTML = i18n.t('app.title');
  app_body.classList.remove('loading');
  return true;
}

function keycodesRemap(defines) {
  const sprite = remapper('standard', platform, defines);
  Object.keys(sprite).map((kc) => {
    sprite[`keycode-${kc}`] = sprite[kc];
    delete sprite[kc];
  });
  return sprite;
}

var packs = null
function getPack(korm, pack_id = null) {
  if (!pack_id) {
    if (store.get(korm=='keyboard' ? MV_KEYBOARD_PACK_LSID : MV_MOUSE_PACK_LSID)) {
      pack_id = store.get(korm=='keyboard' ? MV_KEYBOARD_PACK_LSID : MV_MOUSE_PACK_LSID);

      if(korm=='keyboard'){
        packs = keyboardpacks;
      }else{
        packs = mousepacks;
      }

      if (!getPack(korm, pack_id)) {
        return packs[0];
      }
    } else {
      return packs[0];
    }
  }
  store.set(korm=='keyboard' ? MV_KEYBOARD_PACK_LSID : MV_MOUSE_PACK_LSID, pack_id);
  return packs.find((pack) => pack.pack_id == pack_id);
}

function packsToOptions(packs, pack_list, korm) {
  const selected_pack_id = store.get(korm=='keyboard' ? MV_KEYBOARD_PACK_LSID : MV_MOUSE_PACK_LSID);
  const groups = [];
  packs.map((pack) => {
    const exists = groups.find((group) => group.id == pack.group);
    if (!exists) {
      const group = {
        id: pack.group,
        name: pack.group || 'Default',
        packs: [pack],
      };
      groups.push(group);
    } else {
      exists.packs.push(pack);
    }
  });

  for (let group of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.name;
    optgroup.class = group.name;
    for (let pack of group.packs) {
      const is_selected = selected_pack_id == pack.pack_id;
      if (is_selected) {
        if(korm=='keyboard'){
          current_keyboard_pack = pack;
        }
        else{
          current_mouse_pack = pack;
        }
      }
      const opt = document.createElement('option');
      opt.text = pack.name;
      opt.value = pack.pack_id;
      opt.selected = is_selected ? 'selected' : false;
      optgroup.appendChild(opt);
    }
    pack_list.appendChild(optgroup);
  }

  pack_list.addEventListener('change', (e) => {
    const selected_id = e.target.options[e.target.selectedIndex].value;
    store.set(korm=='keyboard' ? MV_KEYBOARD_PACK_LSID : MV_MOUSE_PACK_LSID, selected_id);
    if(korm=='keyboard'){
      current_keyboard_pack = getPack(korm);
    }
    else{
      current_mouse_pack = getPack(korm);
    }
  });
}

(function (window, document) {
  window.addEventListener('DOMContentLoaded', async () => {
    const version = document.getElementById('app-version');
    const update_available = document.getElementById('update-available');
    const new_version = document.getElementById('new-version');
    const app_logo = document.getElementById('logo');
    const app_body = document.getElementById('app-body');
    const keyboardpack_list = document.getElementById('keyboardpack-list');
    const mousepack_list = document.getElementById('mousepack-list');
    const volume_value = document.getElementById('keyboard-volume-value-display');
    const volume = document.getElementById('keyvolume');
    const mouse_volume_value = document.getElementById('mouse-volume-value-display');
    const mouse_volume = document.getElementById('mousevolume');
    const mouseslider = document.getElementById('MouseVolSlider');
    const soundpackbug = document.getElementById('soundpack-bug');
    const mouseNotification = document.getElementById('mouseSounds');
    const ApplicationBody = document.getElementById('overall-body');

    applyTranslations();

    version.innerHTML = APP_VERSION;

    var fuckcheck = await loadPacks(app_logo, app_body);

    if(fuckcheck){
      soundpackbug.classList.remove('hidden');
    }

    packsToOptions(keyboardpacks, keyboardpack_list, 'keyboard');
    packsToOptions(mousepacks, mousepack_list, 'mouse');

    if (current_keyboard_pack == null){
      keyboardpack_list.selectedIndex = -1;
    }

    if (current_mouse_pack == null){
      mousepack_list.selectedIndex = -1;
    }

    fetch('https://api.github.com/repos/PyroCalzone/MechVibesPlusPlus/releases/latest')
      .then((res) => res.json())
      .then((json) => {
        if (json.tag_name > APP_VERSION) {
          new_version.innerHTML = json.tag_name;
          update_available.classList.remove('hidden');
        }
      });

    Array.from(document.getElementsByClassName('open-in-browser')).forEach((elem) => {
      elem.addEventListener('click', (e) => {
        e.preventDefault();
        shell.openExternal(e.target.href);
      });
    });

    try {
      current_keyboard_pack = getPack('keyboard');
      current_mouse_pack = getPack('mouse');
    } catch {
      soundpackbug.classList.remove('hidden');
    };

    if (store.get(MV_KEY_VOL_LSID)) {
      volume.value = store.get(MV_KEY_VOL_LSID);
    };

    volume_value.innerHTML = volume.value;
    volume.oninput = function (e) {
      volume_value.innerHTML = this.value;
      store.set(MV_KEY_VOL_LSID, this.value);
    };

    if (store.get(MV_MOUSE_VOL_LSID)) {
      mouse_volume.value = store.get(MV_MOUSE_VOL_LSID);
    }
    mouse_volume_value.innerHTML = mouse_volume.value;
    mouse_volume.oninput = function (e) {
      mouse_volume_value.innerHTML = this.value;
      store.set(MV_MOUSE_VOL_LSID, this.value);
    };

    function removeOptions(selectElement) {
      for(var i = 0; i>=500; i++) {
         selectElement.remove(0);
      }
   }

    ipcRenderer.on("refresh", async () => {
      const $ = require('jquery');
      removeOptions(document.getElementById('keyboardpack-list'));
      $('#keyboardpack-list').find('optgroup').empty();
      $('#keyboardpack-list').find('optgroup').remove();
      removeOptions(document.getElementById('mousepack-list'));
      $('#mousepack-list').find('optgroup').empty();
      $('#mousepack-list').find('optgroup').remove();

      keyboardpacks = [];
      mousepacks = [];

      var fuckcheck2 = await loadPacks(app_logo, app_body)

      packsToOptions(keyboardpacks, keyboardpack_list, 'keyboard');
      packsToOptions(mousepacks, mousepack_list, 'mouse');

      app_logo.innerHTML = i18n.t('app.title');
    })

    ipcRenderer.on('locale-changed', function (_event, locale) {
      i18n.setLocale(locale);
      applyTranslations();
      app_logo.innerHTML = i18n.t('app.title');
    });

    if (!is_muted) {
      iohook.start();
    }

    ipcRenderer.on('muted', function (_event, _is_muted) {
      is_muted = _is_muted;
      if (is_muted) {
        iohook.stop();
      } else {
        iohook.start();
      }
    });

    var playKeyupSound

    if(is_keyup){
      playKeyupSound = true
    }

    ipcRenderer.on('theKeyup', function (_event, _is_keyup) {
      is_keyup = _is_keyup;
      if (is_keyup) {
        playKeyupSound = true
      } else {
        playKeyupSound = false
      }
    });

    var playMouseSounds

    if(is_mousesounds){
      playMouseSounds = true
      mouse_volume_value.classList.remove('hidden');
      mouse_volume.classList.remove('hidden');
      mousepack_list.classList.remove('hidden');
      mouseslider.classList.remove('hidden');
      mouseNotification.classList.add('hidden');
    }

    ipcRenderer.on('MouseSounds', function (_event, _is_mousesounds) {
      is_mousesounds = _is_mousesounds;
      if (is_mousesounds) {
        playMouseSounds = true
        mouse_volume_value.classList.remove('hidden');
        mouse_volume.classList.remove('hidden');
        mousepack_list.classList.remove('hidden');
        mouseslider.classList.remove('hidden');
        mouseNotification.classList.add('hidden');
      } else {
        playMouseSounds = false
        mouseslider.classList.add('hidden');
        mousepack_list.classList.add('hidden');
        mouse_volume_value.classList.add('hidden');
        mouse_volume.classList.add('hidden');
        mouseNotification.classList.remove('hidden');
      }
    });

    var randomSounds

    if(is_random){
      randomSounds = true
    }

    ipcRenderer.on('RandomSoundEnable', function (_event, _is_random) {
      is_random = _is_random;
      if (is_random) {
        randomSounds = true
      } else {
        randomSounds = false
      }
    });

    iohook.on('mousedown', ({ button }) => {
      if(playMouseSounds){
        if (current_mouse_down != null && current_mouse_down == button) {
          return;
        }

        current_mouse_down = button;

        const sound_id = `${current_mouse_down}`;

        if (current_mouse_pack) {
          playMouseSound(`${sound_id}`, store.get(MV_MOUSE_VOL_LSID), 'down')
        }
      }
    })

    iohook.on('mouseup', () => {
      if(playMouseSounds){
        playMouseSound(`${current_mouse_down}`, store.get(MV_MOUSE_VOL_LSID), 'up')
      }
      current_mouse_down = null;
    })



    var keyPressedList = []


    iohook.on('keyup', ({ keycode }) => {
      if(playKeyupSound){
        playSound(`${keycode}`, store.get(MV_KEY_VOL_LSID), playKeyupSound, 'up');
      }
      try{
        keyPressedList.splice(keyPressedList.indexOf(keycode), 1);
      }
      catch{
        console.log("Caught bad keypress")
      }
      if(keyPressedList.length < 1){
        app_logo.classList.remove('pressed');
      }
    });

    iohook.on('keydown', ({ keycode }) => {
      if (keyPressedList.includes(keycode)) {
        return;
      }

      app_logo.classList.add('pressed');

      const applicablekeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83]
      const nonapplicablekeys = [57, 29, 3613, 42, 54, 58, 28, 15, 14, 56, 3640]

      keyPressedList.push(keycode);

      if(randomSounds && !nonapplicablekeys.includes(keycode)){
        current_sound_key = applicablekeys[Math.floor(Math.random() * applicablekeys.length)];
      }
      else{
        current_sound_key = keycode;
      }


      var sound_id = `${current_sound_key}`;

      if (current_keyboard_pack) {
        if(playKeyupSound){
          playSound(`${current_sound_key}`, store.get(MV_KEY_VOL_LSID), playKeyupSound, 'down');
        }
        else{
          playSound(sound_id, store.get(MV_KEY_VOL_LSID), playKeyupSound, 'null');
        }
      }
    });
  });
})(window, document);

function playSound(sound_id, volume, playKeyupSound, downOrUp) {

  var initOne
  var initTwo
  const pack_compatibility = current_keyboard_pack.compatibility ? current_keyboard_pack.compatibility : false;
  var keycode = `keycode-${sound_id}`;


      if(playKeyupSound && downOrUp == 'down' && pack_compatibility){
        keycode = `keycode-0${sound_id}`
      }
      else if(playKeyupSound && downOrUp == 'up' && pack_compatibility){
        keycode = `keycode-00${sound_id}`
      }

  const play_type = current_keyboard_pack.key_define_type ? current_keyboard_pack.key_define_type : 'single';
  const sound = play_type == 'single' ? current_keyboard_pack.sound : current_keyboard_pack.sound[keycode];
  if (!sound) {
    return;
  }

      var tempHoldings
      if(playKeyupSound && !pack_compatibility && downOrUp == 'down'){
        if(play_type == 'single'){
          tempHoldings = sound['_sprite'][keycode]
          initOne = sound['_sprite'][keycode][0]
          initTwo = sound['_sprite'][keycode][1]
            sound['_sprite'][keycode][1] = Math.floor(initTwo/2)
        }
        else{
          tempHoldings = sound['_sprite']['__default']
          initOne = sound['_sprite']['__default'][0]
          initTwo = sound['_sprite']['__default'][1]
          sound['_sprite']['__default'][1] = Math.floor(initTwo/2)
        }
      }

      else if(playKeyupSound && !pack_compatibility && downOrUp == 'up'){
        if(play_type == 'single'){
          tempHoldings = sound['_sprite'][keycode]
          initOne = sound['_sprite'][keycode][0]
          initTwo = sound['_sprite'][keycode][1]
            sound['_sprite'][keycode][0] = initOne+Math.floor((initTwo/2))
            sound['_sprite'][keycode][1] = Math.floor(initTwo/2)
        }
        else{
          tempHoldings = sound['_sprite']['__default']
          initOne = sound['_sprite']['__default'][0]
          initTwo = sound['_sprite']['__default'][1]
          sound['_sprite']['__default'][0] = initOne+Math.floor((initTwo/2))
          sound['_sprite']['__default'][1] = Math.floor(initTwo/2)
        }
      }


  sound.volume(Number(volume / 100));
  if (play_type == 'single') {
    sound.play(keycode);
  } else {
    sound.play();
  }

      if(playKeyupSound && !pack_compatibility){
        if(play_type=='single'){
          sound['_sprite'][keycode][0] = initOne
          sound['_sprite'][keycode][1] = initTwo
        }
        else{
          sound['_sprite']['__default'][0] = initOne
          sound['_sprite']['__default'][1] = initTwo
        }
      }
}

function playMouseSound(mouseCode, volume, downOrUp){
  var keycode = `keycode-${mouseCode}`;

  if(downOrUp == 'down'){
    keycode = `keycode-${mouseCode}`;
  }
  else if(downOrUp == 'up'){
    keycode = `keycode-0${mouseCode}`;
  }

  const play_type = current_mouse_pack.key_define_type ? current_mouse_pack.key_define_type : 'single';
  const sound = play_type == 'single' ? current_mouse_pack.sound : current_mouse_pack.sound[keycode];
  if (!sound) {
    return;
  }

  sound.volume(Number(volume / 100));
  if (play_type == 'single') {
    sound.play(keycode);
  } else {
    sound.play();
  }
}

// Material Symbols (Rounded, weight 400) used by the app. Each one is imported
// on its own so only these end up in the bundle.
import description from '@material-symbols/svg-400/rounded/description.svg?raw';
import editNote from '@material-symbols/svg-400/rounded/edit_note.svg?raw';
import tune from '@material-symbols/svg-400/rounded/tune.svg?raw';
import menuBook from '@material-symbols/svg-400/rounded/menu_book.svg?raw';
import add from '@material-symbols/svg-400/rounded/add.svg?raw';
import refresh from '@material-symbols/svg-400/rounded/refresh.svg?raw';
import search from '@material-symbols/svg-400/rounded/search.svg?raw';
import settings from '@material-symbols/svg-400/rounded/settings.svg?raw';
import darkMode from '@material-symbols/svg-400/rounded/dark_mode.svg?raw';
import lightMode from '@material-symbols/svg-400/rounded/light_mode.svg?raw';
import code from '@material-symbols/svg-400/rounded/code.svg?raw';
import visibility from '@material-symbols/svg-400/rounded/visibility.svg?raw';
import visibilityOff from '@material-symbols/svg-400/rounded/visibility_off.svg?raw';
import verticalSplit from '@material-symbols/svg-400/rounded/vertical_split.svg?raw';
import cloudUpload from '@material-symbols/svg-400/rounded/cloud_upload.svg?raw';
import undo from '@material-symbols/svg-400/rounded/undo.svg?raw';
import deleteIcon from '@material-symbols/svg-400/rounded/delete.svg?raw';
import close from '@material-symbols/svg-400/rounded/close.svg?raw';
import check from '@material-symbols/svg-400/rounded/check.svg?raw';
import desktopWindows from '@material-symbols/svg-400/rounded/desktop_windows.svg?raw';
import mobile from '@material-symbols/svg-400/rounded/mobile.svg?raw';
import lock from '@material-symbols/svg-400/rounded/lock.svg?raw';
import warning from '@material-symbols/svg-400/rounded/warning.svg?raw';
import logout from '@material-symbols/svg-400/rounded/logout.svg?raw';
import palette from '@material-symbols/svg-400/rounded/palette.svg?raw';
import keyboardArrowDown from '@material-symbols/svg-400/rounded/keyboard_arrow_down.svg?raw';
import chevronRight from '@material-symbols/svg-400/rounded/chevron_right.svg?raw';
import formatBold from '@material-symbols/svg-400/rounded/format_bold.svg?raw';
import formatListBulleted from '@material-symbols/svg-400/rounded/format_list_bulleted.svg?raw';
import info from '@material-symbols/svg-400/rounded/info.svg?raw';
import image from '@material-symbols/svg-400/rounded/image.svg?raw';
import functionIcon from '@material-symbols/svg-400/rounded/function.svg?raw';
import openInNew from '@material-symbols/svg-400/rounded/open_in_new.svg?raw';
import translate from '@material-symbols/svg-400/rounded/translate.svg?raw';
import error from '@material-symbols/svg-400/rounded/error.svg?raw';
import arrowBack from '@material-symbols/svg-400/rounded/arrow_back.svg?raw';
import syncProblem from '@material-symbols/svg-400/rounded/sync_problem.svg?raw';
import descriptionFill from '@material-symbols/svg-400/rounded/description-fill.svg?raw';
import editNoteFill from '@material-symbols/svg-400/rounded/edit_note-fill.svg?raw';
import tuneFill from '@material-symbols/svg-400/rounded/tune-fill.svg?raw';
import menuBookFill from '@material-symbols/svg-400/rounded/menu_book-fill.svg?raw';

export const ICONS = {
  description: description,
  edit_note: editNote,
  tune: tune,
  menu_book: menuBook,
  add: add,
  refresh: refresh,
  search: search,
  settings: settings,
  dark_mode: darkMode,
  light_mode: lightMode,
  code: code,
  visibility: visibility,
  visibility_off: visibilityOff,
  vertical_split: verticalSplit,
  cloud_upload: cloudUpload,
  undo: undo,
  delete: deleteIcon,
  close: close,
  check: check,
  desktop_windows: desktopWindows,
  mobile: mobile,
  lock: lock,
  warning: warning,
  logout: logout,
  palette: palette,
  keyboard_arrow_down: keyboardArrowDown,
  chevron_right: chevronRight,
  format_bold: formatBold,
  format_list_bulleted: formatListBulleted,
  info: info,
  image: image,
  function: functionIcon,
  open_in_new: openInNew,
  translate: translate,
  error: error,
  arrow_back: arrowBack,
  sync_problem: syncProblem,
  'description-fill': descriptionFill,
  'edit_note-fill': editNoteFill,
  'tune-fill': tuneFill,
  'menu_book-fill': menuBookFill,
} as const;

export type IconName = keyof typeof ICONS;

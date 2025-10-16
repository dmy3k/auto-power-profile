# Auto Power Profile

[![Tests](https://github.com/dmy3k/auto-power-profile/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/dmy3k/auto-power-profile/actions/workflows/tests.yml)

GNOME Shell extension to automatically switch between power profiles based on power supply status and battery level.

The extension addresses long-standing issues in `gnome-settings-daemon`
[#715](https://gitlab.gnome.org/GNOME/gnome-settings-daemon/-/issues/715), [#810](https://gitlab.gnome.org/GNOME/gnome-settings-daemon/-/issues/810)

## Settings

![Settings window](.github/img/settings.png)

## Installation

### Dependencies

This extension requires [`powerprofilesctl`](https://gitlab.freedesktop.org/upower/power-profiles-daemon) (used in most distros with Gnome desktop) or `tuned-ppd` (Fedora >= 40) package to operate.

### From Gnome Extensions store

This extension can be found in the [store](https://extensions.gnome.org/extension/6583/auto-power-profile/).

[<img src=".github/img/store.png" height="100" alt="Get it on GNOME Extensions">](https://extensions.gnome.org/extension/6583/auto-power-profile/)

### From source

Typically this is needed for testing and development. Clone the repo, pack and install the extension.

```bash
git clone https://github.com/dmy3k/auto-power-profile
cd auto-power-profile

make install
make enable
```

Use of makefile is optional, commands from it can be executed directly

### Translations

Discover new translation strings, update the translation template and merge template into existing translations

```bash
make update-translations
```

Then edit the corresponding `po` files (e.g., with [Poedit](https://poedit.net/)) and create a pull request.

## Contribution

Contribution to this project are welcome

## Credits

To the authors of [`power-profile-switcher`](https://github.com/eliapasquali/power-profile-switcher), as current project was based on it.

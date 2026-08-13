// Canonical palettes with per-scheme role mappings. Hex values are copied
// verbatim from the listed source; gen-schemes.mjs converts them to oklch and
// verify-schemes.mjs checks the output against these numbers.
//
// Roles: background, card, sidebar, hover, highlight, border (all optional
// bar the first; derived when the palette names no such surface), foreground,
// mutedForeground (optional), brand, ok, warn, destructive, gifted, users[4],
// charts[5]. Every value is a key of the family's colors table.
//
// hover and highlight are the surfaces under a hovered and an active control.
// Nearly every theme names its own pair (Visual, PmenuSel, a selection tone,
// a rung on its background ladder), so those beat any computed mix: they are
// the tones its users recognize.
export const families = [
  {
    family: 'Catppuccin',
    source: 'https://raw.githubusercontent.com/catppuccin/palette/main/palette.json',
    colors: {
      rosewater: '#f5e0dc', pink: '#f5c2e7', mauve: '#cba6f7', red: '#f38ba8',
      peach: '#fab387', yellow: '#f9e2af', green: '#a6e3a1', teal: '#94e2d5',
      sapphire: '#74c7ec', blue: '#89b4fa', lavender: '#b4befe',
      text: '#cdd6f4', subtext0: '#a6adc8', surface0: '#313244', surface1: '#45475a',
      surface2: '#585b70',
      base: '#1e1e2e', mantle: '#181825', crust: '#11111b',
    },
    schemes: [
      {
        id: 'catppuccin-mocha', side: 'dark', label: 'Catppuccin Mocha',
        roles: {
          background: 'base', card: 'surface0', sidebar: 'mantle',
          highlight: 'surface1', border: 'surface2',
          foreground: 'text', mutedForeground: 'subtext0',
          brand: 'mauve', ok: 'green', warn: 'yellow', destructive: 'red', gifted: 'peach',
          users: ['red', 'blue', 'pink', 'teal'],
          charts: ['mauve', 'sapphire', 'green', 'peach', 'pink'],
        },
      },
    ],
  },
  {
    family: 'Catppuccin',
    source: 'https://raw.githubusercontent.com/catppuccin/palette/main/palette.json',
    colors: {
      rosewater: '#f4dbd6', pink: '#f5bde6', mauve: '#c6a0f6', red: '#ed8796',
      peach: '#f5a97f', yellow: '#eed49f', green: '#a6da95', teal: '#8bd5ca',
      sapphire: '#7dc4e4', blue: '#8aadf4', lavender: '#b7bdf8',
      text: '#cad3f5', subtext0: '#a5adcb', surface0: '#363a4f', surface1: '#494d64',
      surface2: '#5b6078',
      base: '#24273a', mantle: '#1e2030', crust: '#181926',
    },
    schemes: [
      {
        id: 'catppuccin-macchiato', side: 'dark', label: 'Catppuccin Macchiato',
        roles: {
          background: 'base', card: 'surface0', sidebar: 'mantle',
          highlight: 'surface1', border: 'surface2',
          foreground: 'text', mutedForeground: 'subtext0',
          brand: 'mauve', ok: 'green', warn: 'yellow', destructive: 'red', gifted: 'peach',
          users: ['red', 'blue', 'pink', 'teal'],
          charts: ['mauve', 'sapphire', 'green', 'peach', 'pink'],
        },
      },
    ],
  },
  {
    family: 'Catppuccin',
    source: 'https://raw.githubusercontent.com/catppuccin/palette/main/palette.json',
    colors: {
      rosewater: '#f2d5cf', pink: '#f4b8e4', mauve: '#ca9ee6', red: '#e78284',
      peach: '#ef9f76', yellow: '#e5c890', green: '#a6d189', teal: '#81c8be',
      sapphire: '#85c1dc', blue: '#8caaee', lavender: '#babbf1',
      text: '#c6d0f5', subtext0: '#a5adce', surface0: '#414559', surface1: '#51576d',
      surface2: '#626880',
      base: '#303446', mantle: '#292c3c', crust: '#232634',
    },
    schemes: [
      {
        id: 'catppuccin-frappe', side: 'dark', label: 'Catppuccin Frappé',
        roles: {
          background: 'base', card: 'surface0', sidebar: 'mantle',
          highlight: 'surface1', border: 'surface2',
          foreground: 'text', mutedForeground: 'subtext0',
          brand: 'mauve', ok: 'green', warn: 'yellow', destructive: 'red', gifted: 'peach',
          users: ['red', 'blue', 'pink', 'teal'],
          charts: ['mauve', 'sapphire', 'green', 'peach', 'pink'],
        },
      },
    ],
  },
  {
    family: 'Solarized',
    source: 'https://ethanschoonover.com/solarized/',
    colors: {
      base03: '#002b36', base02: '#073642', base01: '#586e75', base00: '#657b83',
      base0: '#839496', base1: '#93a1a1', base2: '#eee8d5', base3: '#fdf6e3',
      yellow: '#b58900', orange: '#cb4b16', red: '#dc322f', magenta: '#d33682',
      violet: '#6c71c4', blue: '#268bd2', cyan: '#2aa198', green: '#859900',
    },
    schemes: [
      {
        // Solarized carries two dark grounds. base02, its documented background
        // highlight, holds the cards. base01 doubles as the muted text tone, so
        // a surface painted in it leaves body copy unreadable. The selected
        // state is the one derived tone in the set, kept on the accent hue.
        id: 'solarized-dark', side: 'dark', label: 'Solarized Dark',
        roles: {
          background: 'base03', card: 'base02', sidebar: 'base02',
          foreground: 'base0', mutedForeground: 'base01',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'violet', 'magenta', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'orange', 'magenta'],
        },
      },
    ],
  },
  {
    family: 'Nord',
    source: 'https://raw.githubusercontent.com/nordtheme/nord/develop/src/nord.scss',
    colors: {
      nord0: '#2e3440', nord1: '#3b4252', nord2: '#434c5e', nord3: '#4c566a',
      nord4: '#d8dee9', nord5: '#e5e9f0', nord6: '#eceff4',
      nord7: '#8fbcbb', nord8: '#88c0d0', nord9: '#81a1c1', nord10: '#5e81ac',
      nord11: '#bf616a', nord12: '#d08770', nord13: '#ebcb8b',
      nord14: '#a3be8c', nord15: '#b48ead',
    },
    schemes: [
      {
        // nord8 is the palette's documented core accent; nord2 is documented as
        // the selection and highlight color, nord13 as the warning color.
        id: 'nord', side: 'dark', label: 'Nord',
        roles: {
          background: 'nord0', card: 'nord1', sidebar: 'nord0',
          hover: 'nord2', highlight: 'nord3',
          foreground: 'nord6', mutedForeground: 'nord4',
          brand: 'nord8', ok: 'nord14', warn: 'nord13', destructive: 'nord11', gifted: 'nord12',
          users: ['nord12', 'nord9', 'nord15', 'nord7'],
          charts: ['nord8', 'nord9', 'nord14', 'nord13', 'nord15'],
        },
      },
      {
        // Snow Storm carries the ground; the role split light-on-dark is ours,
        // since no separate official light spec exists. nord6 is the lightest
        // tone, so it takes the cards and nord5 the page below them.
        id: 'nord-light', side: 'light', label: 'Nord Light',
        roles: {
          background: 'nord5', card: 'nord6', sidebar: 'nord5',
          highlight: 'nord4', border: 'nord4',
          foreground: 'nord0', mutedForeground: 'nord3',
          brand: 'nord10', ok: 'nord14', warn: 'nord13', destructive: 'nord11', gifted: 'nord12',
          users: ['nord12', 'nord10', 'nord15', 'nord7'],
          charts: ['nord10', 'nord9', 'nord14', 'nord13', 'nord15'],
        },
      },
    ],
  },
  {
    // Names follow the tmTheme scopes: keyword pink, entity green, storage
    // cyan, constant purple, parameter orange, string yellow. Pink doubles as
    // the theme's own invalid color, hence the destructive slot.
    family: 'Monokai',
    source: 'https://web.archive.org/web/20170704152926/https://www.monokai.nl/attic/textmate/Monokai.tmTheme',
    colors: {
      background: '#272822', foreground: '#F8F8F2', invisibles: '#3B3A32',
      lineHighlight: '#3E3D32', selection: '#49483E', comment: '#75715E',
      yellow: '#E6DB74', purple: '#AE81FF', pink: '#F92672',
      cyan: '#66D9EF', green: '#A6E22E', orange: '#FD971F',
    },
    schemes: [
      {
        // The theme's own three raised tones, in its order: invisibles, then
        // the current line, then the selection.
        id: 'monokai', side: 'dark', label: 'Monokai',
        roles: {
          background: 'background', card: 'invisibles', sidebar: 'background',
          hover: 'lineHighlight', highlight: 'selection',
          foreground: 'foreground', mutedForeground: 'comment',
          brand: 'cyan', ok: 'green', warn: 'orange', destructive: 'pink', gifted: 'yellow',
          users: ['orange', 'purple', 'pink', 'green'],
          charts: ['cyan', 'purple', 'green', 'orange', 'pink'],
        },
      },
    ],
  },
  {
    family: 'Sonokai',
    source: 'https://raw.githubusercontent.com/sainnhe/sonokai/master/autoload/sonokai.vim',
    colors: {
      black: '#181819', bg_dim: '#222327', bg0: '#2c2e34', bg1: '#33353f',
      bg2: '#363944', bg3: '#3b3e48', bg4: '#414550', fg: '#e2e2e3',
      red: '#fc5d7c', orange: '#f39660', yellow: '#e7c664', green: '#9ed072',
      blue: '#76cce0', purple: '#b39df3', gray: '#7f8490',
    },
    schemes: [
      {
        // bg4 is the theme's Visual and MatchParen tone, bg2 its current-word
        // highlight, so they carry the selected and hovered surfaces here.
        id: 'sonokai', side: 'dark', label: 'Sonokai',
        roles: {
          background: 'bg0', card: 'bg1', sidebar: 'bg_dim',
          hover: 'bg2', highlight: 'bg4', border: 'black',
          foreground: 'fg', mutedForeground: 'gray',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'purple', 'green'],
          charts: ['blue', 'purple', 'green', 'orange', 'red'],
        },
      },
    ],
  },
  {
    family: 'Ayu',
    source: 'https://raw.githubusercontent.com/ayu-theme/ayu-colors/master/themes/dark.yaml',
    colors: {
      base: '#0D1017', panel: '#141821', fg: '#BFBDB6', uiFg: '#5A6378',
      accent: '#E6B450', error: '#D95757',
      red: '#F07178', orange: '#FF8F40', yellow: '#FFB454', green: '#AAD94C',
      teal: '#95E6CB', blue: '#59C2FF', purple: '#D2A6FF',
      // ui.selection.active (#475266 at 0.25) flattened over the panel.
      selection: '#212732', line: '#1b1f29',
    },
    schemes: [
      {
        id: 'ayu-dark', side: 'dark', label: 'Ayu Dark',
        roles: {
          background: 'base', card: 'panel', sidebar: 'base',
          highlight: 'selection', border: 'line',
          foreground: 'fg', mutedForeground: 'uiFg',
          brand: 'accent', ok: 'green', warn: 'orange', destructive: 'error', gifted: 'yellow',
          users: ['orange', 'blue', 'purple', 'teal'],
          charts: ['accent', 'blue', 'green', 'orange', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Ayu',
    source: 'https://raw.githubusercontent.com/ayu-theme/ayu-colors/master/themes/mirage.yaml',
    colors: {
      sunk: '#181C26', base: '#1F2430', panel: '#282E3B', fg: '#CCCAC2', uiFg: '#707A8C',
      accent: '#FFCC66', error: '#FF6666',
      red: '#F28779', orange: '#FFA659', yellow: '#FFCD66', green: '#D5FF80',
      teal: '#95E6CB', blue: '#73D0FF', purple: '#DFBFFF',
      // ui.selection.active (#637599 at 0.15) flattened over the panel.
      selection: '#313949', line: '#171b24',
    },
    schemes: [
      {
        // Yellow is one blue step away from the accent, so gifted takes orange
        // to stay apart from the brand.
        id: 'ayu-mirage', side: 'dark', label: 'Ayu Mirage',
        roles: {
          background: 'base', card: 'panel', sidebar: 'sunk', highlight: 'selection', border: 'line',
          foreground: 'fg', mutedForeground: 'uiFg',
          brand: 'accent', ok: 'green', warn: 'yellow', destructive: 'error', gifted: 'orange',
          users: ['orange', 'blue', 'purple', 'teal'],
          charts: ['accent', 'blue', 'green', 'orange', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Ayu',
    source: 'https://raw.githubusercontent.com/ayu-theme/ayu-colors/master/themes/light.yaml',
    colors: {
      sunk: '#EBEEF0', base: '#F8F9FA', lift: '#FCFCFC', fg: '#5C6166', uiFg: '#828E9F',
      accent: '#F29718', error: '#E65050',
      red: '#F07171', orange: '#FA8532', yellow: '#EBA400', green: '#86B300',
      teal: '#4CBF99', blue: '#22A4E6', purple: '#A37ACC',
      // ui.selection.active (#6B7D8F at 0.14) flattened over the lift surface.
      selection: '#e8eaed', line: '#eaedef', panel: '#fafafa',
    },
    schemes: [
      {
        id: 'ayu-light', side: 'light', label: 'Ayu Light',
        roles: {
          background: 'base', card: 'lift', sidebar: 'panel', highlight: 'selection', border: 'line',
          foreground: 'fg', mutedForeground: 'uiFg',
          brand: 'accent', ok: 'green', warn: 'orange', destructive: 'error', gifted: 'yellow',
          users: ['orange', 'blue', 'purple', 'teal'],
          charts: ['accent', 'blue', 'green', 'orange', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Everforest',
    source: 'https://raw.githubusercontent.com/sainnhe/everforest/master/autoload/everforest.vim',
    colors: {
      bg_dim: '#232a2e', bg0: '#2d353b', bg1: '#343f44', bg2: '#3d484d',
      bg3: '#475258', bg4: '#4f585e', fg: '#d3c6aa',
      red: '#e67e80', orange: '#e69875', yellow: '#dbbc7f', green: '#a7c080',
      aqua: '#83c092', blue: '#7fbbb3', purple: '#d699b6', gray1: '#859289',
    },
    schemes: [
      {
        id: 'everforest-dark', side: 'dark', label: 'Everforest Dark',
        roles: {
          background: 'bg0', card: 'bg1', sidebar: 'bg_dim',
          hover: 'bg2', highlight: 'bg3', border: 'bg4',
          foreground: 'fg', mutedForeground: 'gray1',
          brand: 'green', ok: 'aqua', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'purple', 'aqua'],
          charts: ['green', 'blue', 'aqua', 'orange', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Everforest',
    source: 'https://raw.githubusercontent.com/sainnhe/everforest/master/autoload/everforest.vim',
    colors: {
      bg0: '#fdf6e3', bg1: '#f4f0d9', bg2: '#efebd4', bg3: '#e6e2cc',
      bg4: '#e0dcc7', bg5: '#bdc3af', fg: '#5c6a72',
      red: '#f85552', orange: '#f57d26', yellow: '#dfa000', green: '#8da101',
      aqua: '#35a77c', blue: '#3a94c5', purple: '#df69ba', gray2: '#829181',
    },
    schemes: [
      {
        // bg0 is the palette's brightest surface, so it carries the cards and
        // bg1 the page, the same split Catppuccin Latte uses. bg2 is taken by
        // the sidebar, so the interaction pair steps down to bg3 and bg4.
        id: 'everforest-light', side: 'light', label: 'Everforest Light',
        roles: {
          background: 'bg1', card: 'bg0', sidebar: 'bg2',
          hover: 'bg3', highlight: 'bg4', border: 'bg5',
          foreground: 'fg', mutedForeground: 'gray2',
          brand: 'green', ok: 'aqua', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'purple', 'aqua'],
          charts: ['green', 'blue', 'aqua', 'orange', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Gruvbox',
    source: 'https://raw.githubusercontent.com/morhetz/gruvbox/master/colors/gruvbox.vim',
    colors: {
      bg0_hard: '#1d2021', bg0: '#282828', bg1: '#3c3836', bg2: '#504945',
      bg3: '#665c54', bg4: '#7c6f64', fg1: '#ebdbb2', gray: '#928374',
      neutral_yellow: '#d79921',
      bright_red: '#fb4934', bright_green: '#b8bb26', bright_yellow: '#fabd2f',
      bright_blue: '#83a598', bright_purple: '#d3869b', bright_aqua: '#8ec07c',
      bright_orange: '#fe8019',
    },
    schemes: [
      {
        // bg1 is CursorLine and already carries the cards, so hover and the
        // selected state take the next two rungs: bg2 is the menu ground and
        // bg3 the theme's own Visual color.
        id: 'gruvbox-dark', side: 'dark', label: 'Gruvbox Dark',
        roles: {
          background: 'bg0', card: 'bg1', sidebar: 'bg0_hard',
          hover: 'bg2', highlight: 'bg3', border: 'bg4',
          foreground: 'fg1', mutedForeground: 'gray',
          brand: 'bright_orange', ok: 'bright_green', warn: 'bright_yellow',
          destructive: 'bright_red', gifted: 'neutral_yellow',
          users: ['bright_orange', 'bright_blue', 'bright_purple', 'bright_aqua'],
          charts: ['bright_orange', 'bright_blue', 'bright_green', 'bright_yellow', 'bright_purple'],
        },
      },
    ],
  },
  {
    family: 'Gruvbox',
    source: 'https://raw.githubusercontent.com/morhetz/gruvbox/master/colors/gruvbox.vim',
    colors: {
      bg0_hard: '#f9f5d7', bg0: '#fbf1c7', bg1: '#ebdbb2', bg2: '#d5c4a1',
      bg3: '#bdae93', fg1: '#3c3836', gray: '#928374',
      neutral_yellow: '#d79921',
      faded_red: '#9d0006', faded_green: '#79740e', faded_yellow: '#b57614',
      faded_blue: '#076678', faded_purple: '#8f3f71', faded_aqua: '#427b58',
      faded_orange: '#af3a03',
    },
    schemes: [
      {
        // The light ladder only darkens from bg0, so the cards take the one
        // tone above it and hover plus selected walk down the same rungs the
        // dark side uses.
        id: 'gruvbox-light', side: 'light', label: 'Gruvbox Light',
        roles: {
          background: 'bg0', card: 'bg0_hard', sidebar: 'bg1',
          hover: 'bg1', highlight: 'bg2', border: 'bg3',
          foreground: 'fg1', mutedForeground: 'gray',
          brand: 'faded_orange', ok: 'faded_green', warn: 'faded_yellow',
          destructive: 'faded_red', gifted: 'neutral_yellow',
          users: ['faded_orange', 'faded_blue', 'faded_purple', 'faded_aqua'],
          charts: ['faded_orange', 'faded_blue', 'faded_green', 'faded_yellow', 'faded_purple'],
        },
      },
    ],
  },
  {
    family: 'Iceberg',
    source: 'https://raw.githubusercontent.com/cocopon/iceberg.vim/master/colors/iceberg.vim',
    colors: {
      background: '#161821', chrome: '#0f1117', cursorLine: '#1e2132',
      visual: '#272c42', pmenuSel: '#5b6389', foreground: '#c6c8d1', comment: '#6b7089',
      blue: '#84a0c6', green: '#b4be82', red: '#e27878', orange: '#e2a478',
      magenta: '#a093c7', cyan: '#89b8c2',
    },
    schemes: [
      {
        // The theme's own raised surfaces: the current line, then Visual, then
        // the menu ground for a selected row.
        id: 'iceberg', side: 'dark', label: 'Iceberg',
        roles: {
          background: 'background', card: 'cursorLine', sidebar: 'chrome',
          hover: 'visual', highlight: 'pmenuSel', border: 'chrome',
          foreground: 'foreground', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'cyan',
          users: ['orange', 'blue', 'magenta', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'orange', 'magenta'],
        },
      },
    ],
  },
  {
    family: 'Iceberg',
    source: 'https://raw.githubusercontent.com/cocopon/iceberg.vim/master/colors/iceberg.vim',
    colors: {
      background: '#e8e9ec', cursorLine: '#dcdfe7', visual: '#c9cdd7',
      chrome: '#cad0de', pmenuSel: '#a7b2cd', foreground: '#33374c', comment: '#8389a3',
      blue: '#2d539e', green: '#668e3d', red: '#cc517a', orange: '#c57339',
      magenta: '#7759b4', cyan: '#3f83a6',
    },
    schemes: [
      {
        id: 'iceberg-light', side: 'light', label: 'Iceberg Light',
        roles: {
          background: 'cursorLine', card: 'background', sidebar: 'chrome',
          hover: 'visual', highlight: 'pmenuSel', border: 'chrome',
          foreground: 'foreground', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'cyan',
          users: ['orange', 'blue', 'magenta', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'orange', 'magenta'],
        },
      },
    ],
  },
  {
    // Names follow the vim highlight groups of the source.
    family: 'Jellybeans',
    source: 'https://raw.githubusercontent.com/nanotech/jellybeans.vim/master/colors/jellybeans.vim',
    colors: {
      background: '#151515', cursorLine: '#1c1c1c', foldColumn: '#1f1f1f',
      folded: '#384048', visual: '#404040', split: '#403c41',
      normal: '#e8e8d3', comment: '#888888',
      blue: '#8197bf', redOrange: '#cf6a4c', green: '#99ad6a', special: '#799d6a',
      yellow: '#fad07a', orange: '#ffb964', purple: '#c6b6ee', cyan: '#8fbfdc',
    },
    schemes: [
      {
        // Jellybeans keeps its chrome neutral gray and puts all color in the
        // text, so the selected surface stays gray too.
        id: 'jellybeans', side: 'dark', label: 'Jellybeans',
        roles: {
          background: 'background', card: 'cursorLine', sidebar: 'foldColumn',
          hover: 'folded', highlight: 'visual', border: 'split',
          foreground: 'normal', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'redOrange', gifted: 'yellow',
          users: ['redOrange', 'blue', 'purple', 'special'],
          charts: ['blue', 'cyan', 'green', 'yellow', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Kanagawa',
    source: 'https://raw.githubusercontent.com/rebelot/kanagawa.nvim/master/lua/kanagawa/colors.lua',
    colors: {
      sumiInk0: '#16161D', sumiInk1: '#181820', sumiInk3: '#1F1F28', sumiInk4: '#2A2A37',
      sumiInk5: '#363646', waveBlue2: '#2D4F67', fujiGray: '#727169',
      fujiWhite: '#DCD7BA', crystalBlue: '#7E9CD8', springGreen: '#98BB6C',
      autumnYellow: '#DCA561', roninYellow: '#FF9E3B', samuraiRed: '#E82424',
      oniViolet: '#957FB8', springBlue: '#7FB4CA', carpYellow: '#E6C384',
      sakuraPink: '#D27E99', surimiOrange: '#FFA066', waveAqua2: '#7AA89F',
    },
    schemes: [
      {
        // sumiInk5 is the theme's own "Selected Items" tone and waveBlue2 its
        // popup selection; fujiGray is the documented comment color.
        id: 'kanagawa-wave', side: 'dark', label: 'Kanagawa Wave',
        roles: {
          background: 'sumiInk3', card: 'sumiInk4', sidebar: 'sumiInk1',
          hover: 'sumiInk5', highlight: 'waveBlue2', border: 'sumiInk0',
          foreground: 'fujiWhite', mutedForeground: 'fujiGray',
          brand: 'crystalBlue', ok: 'springGreen', warn: 'roninYellow',
          destructive: 'samuraiRed', gifted: 'carpYellow',
          users: ['surimiOrange', 'springBlue', 'sakuraPink', 'waveAqua2'],
          charts: ['crystalBlue', 'springBlue', 'springGreen', 'autumnYellow', 'oniViolet'],
        },
      },
    ],
  },
  {
    family: 'Kanagawa',
    source: 'https://raw.githubusercontent.com/rebelot/kanagawa.nvim/master/lua/kanagawa/colors.lua',
    colors: {
      dragonBlack0: '#0d0c0c', dragonBlack1: '#12120f', dragonBlack3: '#181616', dragonBlack4: '#282727',
      dragonBlack5: '#393836', waveBlue2: '#2D4F67', dragonAsh: '#737c73',
      dragonBlack6: '#625e5a', dragonWhite: '#c5c9c5',
      dragonBlue2: '#8ba4b0', dragonGreen2: '#8a9a7b', dragonYellow: '#c4b28a',
      dragonRed: '#c4746e', dragonPink: '#a292a3', dragonAqua: '#8ea4a2',
      dragonOrange: '#b6927b', dragonViolet: '#8992a7',
    },
    schemes: [
      {
        // Dragon borrows Wave's blues for its popup selection, so the active
        // surface is cool against the warm near-black ground.
        id: 'kanagawa-dragon', side: 'dark', label: 'Kanagawa Dragon',
        roles: {
          background: 'dragonBlack3', card: 'dragonBlack4', sidebar: 'dragonBlack1',
          hover: 'dragonBlack5', highlight: 'waveBlue2', border: 'dragonBlack0',
          foreground: 'dragonWhite', mutedForeground: 'dragonAsh',
          brand: 'dragonBlue2', ok: 'dragonGreen2', warn: 'dragonOrange',
          destructive: 'dragonRed', gifted: 'dragonYellow',
          users: ['dragonOrange', 'dragonViolet', 'dragonPink', 'dragonAqua'],
          charts: ['dragonBlue2', 'dragonAqua', 'dragonGreen2', 'dragonYellow', 'dragonPink'],
        },
      },
    ],
  },
  {
    family: 'Kanagawa',
    source: 'https://raw.githubusercontent.com/rebelot/kanagawa.nvim/master/lua/kanagawa/colors.lua',
    colors: {
      lotusWhite0: '#d5cea3', lotusWhite1: '#dcd5ac', lotusWhite2: '#e5ddb0',
      lotusWhite3: '#f2ecbc', lotusWhite5: '#e4d794',
      lotusBlue1: '#c7d7e0', lotusBlue3: '#9fb5c9', lotusGray3: '#8a8980',
      lotusInk1: '#545464',
      lotusBlue4: '#4d699b', lotusBlue5: '#5d57a3', lotusGreen: '#6f894e',
      lotusOrange: '#cc6d00', lotusRed: '#c84053', lotusPink: '#b35b79',
      lotusAqua: '#597b75', lotusYellow: '#77713f', lotusViolet4: '#624c83',
    },
    schemes: [
      {
        // lotusWhite3 is the brightest tone, so it carries the cards while
        // lotusWhite2 takes the page. The blues carry the popup selection.
        id: 'kanagawa-lotus', side: 'light', label: 'Kanagawa Lotus',
        roles: {
          background: 'lotusWhite2', card: 'lotusWhite3', sidebar: 'lotusWhite1',
          hover: 'lotusWhite5', highlight: 'lotusBlue3', border: 'lotusWhite0',
          foreground: 'lotusInk1', mutedForeground: 'lotusGray3',
          brand: 'lotusBlue4', ok: 'lotusGreen', warn: 'lotusOrange',
          destructive: 'lotusRed', gifted: 'lotusYellow',
          users: ['lotusOrange', 'lotusBlue5', 'lotusPink', 'lotusAqua'],
          charts: ['lotusBlue4', 'lotusAqua', 'lotusGreen', 'lotusOrange', 'lotusViolet4'],
        },
      },
    ],
  },
  {
    family: 'Nightfox',
    source: 'https://raw.githubusercontent.com/EdenEast/nightfox.nvim/main/lua/nightfox/palette/nightfox.lua',
    colors: {
      bg0: '#131a24', bg1: '#192330', bg2: '#212e3f', bg3: '#29394f',
      bg4: '#39506d', sel1: '#3c5372', fg1: '#cdcecf', comment: '#738091',
      red: '#c94f6d', green: '#81b29a', yellow: '#dbc074', blue: '#719cd6',
      magenta: '#9d79d6', cyan: '#63cdcf', orange: '#f4a261', pink: '#d67ad2',
    },
    schemes: [
      {
        // sel1 is the palette's own popup selection tone.
        id: 'nightfox', side: 'dark', label: 'Nightfox',
        roles: {
          background: 'bg1', card: 'bg2', sidebar: 'bg0',
          hover: 'bg3', highlight: 'sel1', border: 'bg4',
          foreground: 'fg1', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'magenta', 'green'],
          charts: ['blue', 'cyan', 'green', 'yellow', 'magenta'],
        },
      },
    ],
  },
  {
    family: 'Nightfox',
    source: 'https://raw.githubusercontent.com/EdenEast/nightfox.nvim/main/lua/nightfox/palette/dayfox.lua',
    colors: {
      bg0: '#e4dcd4', bg1: '#f6f2ee', bg2: '#dbd1dd', bg3: '#d3c7bb',
      bg4: '#aab0ad', sel1: '#a4c1c2', fg1: '#3d2b5a', comment: '#837a72',
      red: '#a5222f', green: '#396847', yellow: '#AC5402', blue: '#2848a9',
      magenta: '#6e33ce', cyan: '#287980', orange: '#955f61', pink: '#a440b5',
    },
    schemes: [
      {
        // bg1 is the palette's brightest tone, so it carries the cards and bg0
        // the page below them. sel1 is the popup selection.
        id: 'dayfox', side: 'light', label: 'Dayfox',
        roles: {
          background: 'bg0', card: 'bg1', sidebar: 'bg2',
          hover: 'bg3', highlight: 'sel1', border: 'bg4',
          foreground: 'fg1', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'yellow', destructive: 'red', gifted: 'pink',
          users: ['yellow', 'blue', 'pink', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'yellow', 'magenta'],
        },
      },
    ],
  },
  {
    family: 'Rosé Pine',
    source: 'https://rosepinetheme.com/palette/',
    colors: {
      base: '#191724', surface: '#1f1d2e', overlay: '#26233a',
      muted: '#6e6a86', subtle: '#908caa',
      text: '#e0def4', love: '#eb6f92', gold: '#f6c177', rose: '#ebbcba',
      pine: '#31748f', foam: '#9ccfd8', iris: '#c4a7e7',
      highlightLow: '#21202e', highlightMed: '#403d52', highlightHigh: '#524f67',
    },
    schemes: [
      {
        // The palette names its own interaction surfaces: highlight-med is the
        // selected state, highlight-high the borders, overlay the raised layer.
        id: 'rose-pine', side: 'dark', label: 'Rosé Pine',
        roles: {
          background: 'base', card: 'surface', sidebar: 'base',
          highlight: 'highlightMed', hover: 'overlay', border: 'highlightHigh',
          foreground: 'text', mutedForeground: 'subtle',
          brand: 'rose', ok: 'foam', warn: 'gold', destructive: 'love', gifted: 'iris',
          users: ['gold', 'pine', 'iris', 'foam'],
          charts: ['rose', 'pine', 'foam', 'gold', 'iris'],
        },
      },
    ],
  },
  {
    family: 'Rosé Pine',
    source: 'https://rosepinetheme.com/palette/',
    colors: {
      base: '#232136', surface: '#2a273f', overlay: '#393552',
      muted: '#6e6a86', subtle: '#908caa',
      text: '#e0def4', love: '#eb6f92', gold: '#f6c177', rose: '#ea9a97',
      pine: '#3e8fb0', foam: '#9ccfd8', iris: '#c4a7e7',
      highlightLow: '#2a283e', highlightMed: '#44415a', highlightHigh: '#56526e',
    },
    schemes: [
      {
        id: 'rose-pine-moon', side: 'dark', label: 'Rosé Pine Moon',
        roles: {
          background: 'base', card: 'surface', sidebar: 'base',
          highlight: 'highlightMed', hover: 'overlay', border: 'highlightHigh',
          foreground: 'text', mutedForeground: 'subtle',
          brand: 'rose', ok: 'foam', warn: 'gold', destructive: 'love', gifted: 'iris',
          users: ['gold', 'pine', 'iris', 'foam'],
          charts: ['rose', 'pine', 'foam', 'gold', 'iris'],
        },
      },
    ],
  },
  {
    family: 'Rosé Pine',
    source: 'https://rosepinetheme.com/palette/',
    colors: {
      base: '#faf4ed', surface: '#fffaf3', overlay: '#f2e9e1', muted: '#9893a5',
      subtle: '#797593', text: '#464261', love: '#b4637a', gold: '#ea9d34',
      rose: '#d7827e', pine: '#286983', foam: '#56949f', iris: '#907aa9',
      highlightLow: '#f4ede8', highlightMed: '#dfdad9', highlightHigh: '#cecacd',
    },
    schemes: [
      {
        // Overlay carries the sidebar here, so the hover falls back to
        // highlight-low, the palette's own subtle row tint.
        id: 'rose-pine-dawn', side: 'light', label: 'Rosé Pine Dawn',
        roles: {
          background: 'base', card: 'surface', sidebar: 'base',
          highlight: 'highlightMed', hover: 'overlay', border: 'highlightHigh',
          foreground: 'text', mutedForeground: 'subtle',
          brand: 'rose', ok: 'foam', warn: 'gold', destructive: 'love', gifted: 'iris',
          users: ['gold', 'pine', 'iris', 'foam'],
          charts: ['rose', 'pine', 'foam', 'gold', 'iris'],
        },
      },
    ],
  },
  {
    family: 'Tokyo Night',
    source: 'https://raw.githubusercontent.com/folke/tokyonight.nvim/main/extras/lua/tokyonight_night.lua',
    colors: {
      bg: '#1a1b26', bg_dark: '#16161e', bg_highlight: '#292e42',
      bg_visual: '#283457', blue7: '#394b70', fg_gutter: '#3b4261', fg: '#c0caf5',
      blue: '#7aa2f7', cyan: '#7dcfff', green: '#9ece6a', yellow: '#e0af68',
      orange: '#ff9e64', red: '#f7768e', magenta: '#bb9af7', comment: '#565f89',
    },
    schemes: [
      {
        // bg_highlight is CursorLine and already carries the cards, so the
        // selected state takes PmenuSel, the next tone up.
        id: 'tokyo-night', side: 'dark', label: 'Tokyo Night',
        roles: {
          background: 'bg', card: 'bg_highlight', sidebar: 'bg_dark',
          hover: 'bg_visual', highlight: 'blue7', border: 'fg_gutter',
          foreground: 'fg', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'magenta', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'yellow', 'magenta'],
        },
      },
    ],
  },
  {
    family: 'Tokyo Night',
    source: 'https://raw.githubusercontent.com/folke/tokyonight.nvim/main/extras/lua/tokyonight_storm.lua',
    colors: {
      bg: '#24283b', bg_dark: '#1f2335', bg_highlight: '#292e42',
      bg_visual: '#2e3c64', blue7: '#394b70', fg_gutter: '#3b4261', fg: '#c0caf5',
      blue: '#7aa2f7', cyan: '#7dcfff', green: '#9ece6a', yellow: '#e0af68',
      orange: '#ff9e64', red: '#f7768e', magenta: '#bb9af7', comment: '#565f89',
    },
    schemes: [
      {
        id: 'tokyo-night-storm', side: 'dark', label: 'Tokyo Night Storm',
        roles: {
          background: 'bg', card: 'bg_highlight', sidebar: 'bg_dark',
          hover: 'bg_visual', highlight: 'blue7', border: 'fg_gutter',
          foreground: 'fg', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'magenta', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'yellow', 'magenta'],
        },
      },
    ],
  },
  {
    family: 'Tokyo Night',
    source: 'https://raw.githubusercontent.com/folke/tokyonight.nvim/main/extras/lua/tokyonight_day.lua',
    colors: {
      bg: '#e1e2e7', bg_dark: '#d0d5e3', bg_highlight: '#c4c8da',
      pmenuSel: '#b3b8d1', fg_gutter: '#a8aecb', fg: '#3760bf',
      blue: '#2e7de9', cyan: '#007197', green: '#587539', yellow: '#8c6c3e',
      orange: '#b15c00', red: '#f52a65', magenta: '#9854f1', comment: '#848cb5',
    },
    schemes: [
      {
        id: 'tokyo-night-day', side: 'light', label: 'Tokyo Night Day',
        roles: {
          background: 'bg_dark', card: 'bg', sidebar: 'bg_dark',
          hover: 'bg_highlight', highlight: 'pmenuSel', border: 'fg_gutter',
          foreground: 'fg', mutedForeground: 'comment',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'magenta', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'yellow', 'magenta'],
        },
      },
    ],
  },
  {
    // The theme JSON names no palette; accents follow its token scopes.
    family: 'Night Owl',
    source: 'https://raw.githubusercontent.com/sdras/night-owl-vscode-theme/main/themes/Night%20Owl-color-theme.json',
    colors: {
      background: '#011627', rail: '#01111d', panel: '#0b2942', inactiveSel: '#0e293f',
      selection: '#1d3b53', line: '#5f7e97', foreground: '#d6deeb',
      blue: '#82AAFF', green: '#c5e478', tan: '#ecc48d', orange: '#F78C6C',
      red: '#ff5874', purple: '#c792ea', cyan: '#7fdbca',
    },
    schemes: [
      {
        id: 'night-owl', side: 'dark', label: 'Night Owl',
        roles: {
          background: 'background', card: 'panel', sidebar: 'rail',
          hover: 'inactiveSel', highlight: 'selection', border: 'line',
          foreground: 'foreground',
          brand: 'blue', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'tan',
          users: ['orange', 'blue', 'purple', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'tan', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Night Owl',
    source: 'https://raw.githubusercontent.com/sdras/night-owl-vscode-theme/main/themes/Night%20Owl-Light-color-theme.json',
    colors: {
      background: '#FBFBFB', tabActive: '#F6F6F6', lineHighlight: '#F0F0F0',
      inactiveSel: '#E0E7EA', activeSel: '#d3e8f8', line: '#d9d9d9', foreground: '#403f53',
      blue: '#4876d6', green: '#08916a', yellow: '#E0AF02',
      red: '#bc5454', purple: '#994cc3', cyan: '#0c969b',
    },
    schemes: [
      {
        // The theme's own page tones, brightest first: the cards take the
        // lightest and the sidebar the line-highlight gray.
        id: 'light-owl', side: 'light', label: 'Light Owl',
        roles: {
          background: 'tabActive', card: 'background', sidebar: 'lineHighlight',
          hover: 'inactiveSel', highlight: 'activeSel', border: 'line',
          foreground: 'foreground',
          brand: 'blue', ok: 'green', warn: 'yellow', destructive: 'red', gifted: 'purple',
          users: ['yellow', 'blue', 'purple', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'yellow', 'purple'],
        },
      },
    ],
  },
  {
    family: 'GitHub',
    source: 'https://unpkg.com/@primer/primitives@7.15.1/dist/json/colors/dark.json',
    colors: {
      canvas: '#0d1117', canvasSubtle: '#161b22', canvasInset: '#010409',
      borderDefault: '#30363d', neutralSubtle: '#1f242c',
      fg: '#e6edf3', fgMuted: '#7d8590',
      accent: '#2f81f7', success: '#3fb950', danger: '#f85149',
      attention: '#d29922', done: '#a371f7',
      // accent.subtle (rgba(56,139,253,0.15)) flattened over the canvas; the
      // theme uses it for list.focusBackground.
      accentSubtle: '#13233a',
    },
    schemes: [
      {
        id: 'github-dark', side: 'dark', label: 'GitHub Dark',
        roles: {
          background: 'canvas', card: 'canvasSubtle', sidebar: 'canvasInset',
          hover: 'neutralSubtle', highlight: 'accentSubtle', border: 'borderDefault',
          foreground: 'fg', mutedForeground: 'fgMuted',
          brand: 'accent', ok: 'success', warn: 'attention', destructive: 'danger', gifted: 'done',
          users: ['attention', 'accent', 'done', 'success'],
          charts: ['accent', 'done', 'success', 'attention', 'danger'],
        },
      },
    ],
  },
  {
    family: 'GitHub',
    source: 'https://unpkg.com/@primer/primitives@7.15.1/dist/json/colors/light.json',
    colors: {
      canvas: '#ffffff', canvasSubtle: '#f6f8fa', borderDefault: '#d0d7de',
      neutralSubtle: '#f4f6f8', fg: '#1F2328', fgMuted: '#656d76',
      accent: '#0969da', success: '#1a7f37', danger: '#d1242f',
      attention: '#9a6700', done: '#8250df',
      // accent.subtle, opaque in the light primitives.
      accentSubtle: '#ddf4ff',
    },
    schemes: [
      {
        // Primer puts the page on canvas.subtle and the cards on white, which
        // is the split GitHub itself renders.
        id: 'github-light', side: 'light', label: 'GitHub Light',
        roles: {
          background: 'canvasSubtle', card: 'canvas', sidebar: 'canvasSubtle',
          hover: 'neutralSubtle', highlight: 'accentSubtle', border: 'borderDefault',
          foreground: 'fg', mutedForeground: 'fgMuted',
          brand: 'accent', ok: 'success', warn: 'attention', destructive: 'danger', gifted: 'done',
          users: ['attention', 'accent', 'done', 'success'],
          charts: ['accent', 'done', 'success', 'attention', 'danger'],
        },
      },
    ],
  },
  {
    family: 'Vitesse',
    source: 'https://raw.githubusercontent.com/antfu/vscode-theme-vitesse/main/scripts/colors.ts',
    colors: {
      background: '#121212', activeBackground: '#181818', softBorder: '#252525',
      softBackground: '#222222', softActiveBackground: '#292929',
      foreground: '#dbd7ca', primary: '#4d9375',
      green: '#4d9375', cyan: '#5eaab5', blue: '#6394bf', red: '#cb7676',
      orange: '#d4976c', yellow: '#e6cc77', magenta: '#d9739f',
    },
    schemes: [
      {
        // Vitesse keeps every surface neutral and puts the accent in the text,
        // so hover and selected walk its soft-background pair.
        id: 'vitesse-dark', side: 'dark', label: 'Vitesse Dark',
        roles: {
          background: 'background', card: 'activeBackground', sidebar: 'background',
          hover: 'softBackground', highlight: 'softActiveBackground', border: 'softBorder',
          foreground: 'foreground',
          brand: 'primary', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'magenta', 'cyan'],
          charts: ['primary', 'blue', 'yellow', 'orange', 'magenta'],
        },
      },
    ],
  },
  {
    family: 'Vitesse',
    source: 'https://raw.githubusercontent.com/antfu/vscode-theme-vitesse/main/scripts/colors.ts',
    colors: {
      background: '#ffffff', activeBackground: '#f7f7f7', border: '#f0f0f0',
      softBackground: '#F1F0E9', softActiveBackground: '#E7E5DB',
      foreground: '#393a34', primary: '#1c6b48',
      green: '#1e754f', cyan: '#2993a3', blue: '#296aa3', red: '#ab5959',
      orange: '#a65e2b', yellow: '#bda437', magenta: '#a13865',
    },
    schemes: [
      {
        id: 'vitesse-light', side: 'light', label: 'Vitesse Light',
        roles: {
          background: 'activeBackground', card: 'background', sidebar: 'activeBackground',
          hover: 'softBackground', highlight: 'softActiveBackground', border: 'border',
          foreground: 'foreground',
          brand: 'primary', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'blue', 'magenta', 'cyan'],
          charts: ['primary', 'blue', 'yellow', 'orange', 'magenta'],
        },
      },
    ],
  },
  {
    // The 400 steps are the accents for dark ground, the 600 steps for light,
    // per the palette's own light/dark split.
    family: 'Flexoki',
    source: 'https://raw.githubusercontent.com/kepano/flexoki/main/README.md',
    colors: {
      paper: '#FFFCF0', base50: '#F2F0E5', base100: '#E6E4D9', base150: '#DAD8CE',
      base200: '#CECDC3', base500: '#878580', base600: '#6F6E69',
      base800: '#403E3C', base850: '#343331', base900: '#282726',
      base950: '#1C1B1A', black: '#100F0F',
      red400: '#D14D41', red600: '#AF3029', orange400: '#DA702C', orange600: '#BC5215',
      yellow400: '#D0A215', yellow600: '#AD8301', green400: '#879A39', green600: '#66800B',
      cyan400: '#3AA99F', cyan600: '#24837B', blue400: '#4385BE', blue600: '#205EA6',
      purple400: '#8B7EC8', purple600: '#5E409D', magenta400: '#CE5D97', magenta600: '#A02F6F',
    },
    schemes: [
      {
        // ui-2 and ui-3 in Flexoki's own naming: the hovered and the selected
        // row in its editor theme.
        id: 'flexoki-dark', side: 'dark', label: 'Flexoki Dark',
        roles: {
          background: 'black', card: 'base950', sidebar: 'base950',
          hover: 'base850', highlight: 'base800', border: 'base900',
          foreground: 'base200', mutedForeground: 'base500',
          brand: 'blue400', ok: 'green400', warn: 'orange400',
          destructive: 'red400', gifted: 'yellow400',
          users: ['orange400', 'blue400', 'purple400', 'cyan400'],
          charts: ['blue400', 'cyan400', 'green400', 'orange400', 'magenta400'],
        },
      },
      {
        id: 'flexoki-light', side: 'light', label: 'Flexoki Light',
        roles: {
          background: 'base50', card: 'paper', sidebar: 'base50',
          hover: 'base150', highlight: 'base200', border: 'base100',
          foreground: 'black', mutedForeground: 'base600',
          brand: 'blue600', ok: 'green600', warn: 'orange600',
          destructive: 'red600', gifted: 'yellow600',
          users: ['orange600', 'blue600', 'purple600', 'cyan600'],
          charts: ['blue600', 'cyan600', 'green600', 'orange600', 'magenta600'],
        },
      },
    ],
  },
  {
    // Hex values are exact conversions of the HSL definitions in the source.
    family: 'One Light',
    source: 'https://raw.githubusercontent.com/atom/one-light-syntax/master/styles/colors.less',
    colors: {
      level1: '#ffffff', bg: '#fafafa', level3: '#eaeaeb',
      highlight: '#e5e5e6', selected: '#dbdbdc',
      mono1: '#383a42', mono2: '#696c77',
      cyan: '#0184bc', blue: '#4078f2', purple: '#a626a4', green: '#50a14f',
      red1: '#e45649', orange1: '#986801', orange2: '#c18401',
    },
    schemes: [
      {
        // One Light keeps its surfaces neutral gray; the UI layer names the
        // hovered and the selected tone itself.
        id: 'one-light', side: 'light', label: 'One Light',
        roles: {
          background: 'bg', card: 'level1', sidebar: 'level3',
          hover: 'highlight', highlight: 'selected', border: 'selected',
          foreground: 'mono1', mutedForeground: 'mono2',
          brand: 'blue', ok: 'green', warn: 'orange2', destructive: 'red1', gifted: 'orange1',
          users: ['orange2', 'blue', 'purple', 'cyan'],
          charts: ['blue', 'cyan', 'green', 'orange2', 'purple'],
        },
      },
    ],
  },
  {
    family: 'Dracula',
    source: 'https://raw.githubusercontent.com/dracula/draculatheme.com/main/content/spec.mdx',
    colors: {
      background: '#FFFBEB', bgLighter: '#ECE9DF', currentLine: '#E2DECA',
      bgLight: '#DEDCCF', bgDark: '#CECCC0', bgDarker: '#BCBAB3',
      foreground: '#1F1F1F', comment: '#6C664B',
      red: '#CB3A2A', orange: '#A34D14', yellow: '#846E15', green: '#14710A',
      cyan: '#036A96', purple: '#644AC9', pink: '#A3144D',
    },
    schemes: [
      {
        // Alucard's ladder only darkens from paper, so paper takes the cards
        // and Background Lighter the page.
        id: 'alucard', side: 'light', label: 'Dracula Alucard',
        roles: {
          background: 'bgLighter', card: 'background', sidebar: 'bgDark',
          hover: 'bgLighter', highlight: 'bgLight', border: 'bgDarker',
          foreground: 'foreground', mutedForeground: 'comment',
          brand: 'purple', ok: 'green', warn: 'orange', destructive: 'red', gifted: 'yellow',
          users: ['orange', 'cyan', 'pink', 'green'],
          charts: ['purple', 'cyan', 'green', 'orange', 'pink'],
        },
      },
    ],
  },
]

// Central hub for React + the zero-build JSX-like templating helper.
// Every component imports from here instead of repeating esm.sh URLs everywhere,
// which keeps there being exactly one copy of React loaded on the page.
import React from 'react'
import htm from 'htm'

export const html = htm.bind(React.createElement)
export const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React
export default React

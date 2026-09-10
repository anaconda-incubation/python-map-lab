import {expect,it} from 'vitest'
import {readSelection,selectionUrl,presetCode} from '../workspaceState'
it('only accepts known maps and safe named presets from shared URLs',()=>{
  expect(readSelection('?map=unknown&place=javascript:alert(1)')).toEqual({mode:'learn',id:'globe',city:''})
  expect(readSelection('?map=equalEarth&place=tokyo')).toEqual({mode:'learn',id:'equalEarth',city:'tokyo'})
  const selection={mode:'experiments' as const,id:'experiment-5',city:'north-pole'}
  expect(readSelection(selectionUrl(selection).slice(1))).toEqual(selection)
})
it('puts the exact city parameters into the editable Python',()=>{
  expect(presetCode({mode:'learn',id:'mercator',city:'new-york'})).toContain('central_meridian = -74')
  expect(presetCode({mode:'learn',id:'authagraph',city:'tokyo'})).toContain('center_lat, center_lon = 35.7, 139.7')
  expect(presetCode({mode:'experiments',id:'experiment-5',city:'north-pole'})).toContain('center_lat = 90')
})

'use strict';

/**
 * El clasificador del lab tiene que dar el MISMO veredicto que el de Mesita
 * (mesita-app/src/modules/pos/bridge/mesa-classifier.ts) — si no, el
 * laboratorio muestra una mesa donde el restaurante no verá ninguna.
 *
 * Los casos son los del piloto CASA (docs/PILOT_FINDINGS_CASA.md §1 y §4,
 * sobre 2.532 documentos reales).
 */

const { classifyMesaLabel } = require('../src/services/mesaClassifier');

describe('classifyMesaLabel', () => {
  test.each([
    ['1', 1, null],
    ['6', 6, null],
    ['24', 24, null],
    ['49', 49, null],          // último número que es mesa física
    ['4 Sofi', 4, 'Sofi'],     // cuenta dividida dentro de la mesa
    ['Mesa 8', 8, null],       // el prefijo es ruido, no etiqueta
    ['m8', 8, null],
    ['#8', 8, null],
    ['8Sofi', 8, 'Sofi'],
    ['4 Barrera', 4, 'Barrera'], // un apellido con "barr" NO es la barra
  ])('«%s» es la mesa %i', (raw, mesaNumber, billLabel) => {
    expect(classifyMesaLabel(raw)).toEqual({ kind: 'MESA', mesaNumber, billLabel });
  });

  test.each(['50', '51', '499'])('«%s» es el contador de delivery, no una mesa', (raw) => {
    expect(classifyMesaLabel(raw)).toEqual({ kind: 'DELIVERY' });
  });

  test.each([
    ['para llevar', 'keyword'],
    ['barra', 'keyword'],
    ['30 magic', 'keyword'],   // el deny gana aunque haya número delante
    ['', 'empty'],
    ['mesa 3 piso 2', 'unparseable'], // dos números: jamás se adivina
    ['1111', 'unparseable'],
  ])('«%s» no es una mesa (%s)', (raw, reason) => {
    expect(classifyMesaLabel(raw)).toEqual({ kind: 'SIN_MESA', reason });
  });
});

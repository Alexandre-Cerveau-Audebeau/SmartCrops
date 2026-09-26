import type { TFunction } from 'i18next';
import type { UnitSystem } from '../../../contexts/unitSystemContextValue';
import { monthLabel } from './plantCalendar';
import type { TodoTask } from './todoTasks';
import { displayTemperature, nameList } from './weatherFormat';
import { weekdayLong } from './weatherTime';

/**
 * The sentence of a task — with the garden in brackets on an ungrouped list
 * of several gardens, without it where the garden is already named (a group
 * of the Large « À faire » card, the Novice card). A cold task names the
 * TOLERANCE it is about (SMA-336 PR 3b/5, round 1, O1: « 3 plantes sensibles
 * sous 8° », not « 3 plantes connues sensibles »); a task planned on a
 * place's LAST KNOWN weather says so (G2).
 *
 * PR 4a/5 — the calendar tasks name PLANTS, not a number of them
 * (`Main.dc.html`: « Tailler — Thym, Romarin et Tournesol (septembre) »).
 * Past three, `nameList` closes with the « N autres » the weather invitation
 * already uses, so the row never grows past one line.
 *
 * ONE function for the widget and for the Novice card (SMA-448, lot F2): the
 * two surfaces cannot say a task in two ways.
 */
export function todoSentence(
  task: TodoTask,
  grouped: boolean,
  t: TFunction,
  language: string,
  system: UnitSystem
): string {
  const degrees = (celsius: number) =>
    t('dashboard.blocks.weather.degrees', { value: displayTemperature(celsius, system) });

  if (task.month !== null) {
    const plants = nameList(task.names, language, (count) =>
      t('dashboard.blocks.weather.others', { count })
    );
    const month = monthLabel(task.month.month, language);
    const key = grouped ? `${task.kind}Grouped` : task.kind;
    return t(`dashboard.blocks.todo.${key}`, { plants, garden: task.gardenName, month });
  }
  const plants =
    task.kind === 'cold'
      ? t('dashboard.blocks.todo.sensitivePlants', {
          count: task.count,
          threshold: task.toleranceC === null ? '' : degrees(task.toleranceC),
        })
      : t('dashboard.blocks.todo.plants', { count: task.count });
  const when = task.today
    ? t('dashboard.blocks.todo.tonight')
    : t('dashboard.blocks.todo.eveningOf', {
        day: weekdayLong(task.date, language) ?? task.date,
      });
  const temp = task.tempC === null ? '' : degrees(task.tempC);
  const key = grouped ? `${task.kind}Grouped` : task.kind;
  const sentence = t(`dashboard.blocks.todo.${key}`, { plants, garden: task.gardenName, temp, when });
  return task.stale ? t('dashboard.blocks.todo.stale', { task: sentence }) : sentence;
}

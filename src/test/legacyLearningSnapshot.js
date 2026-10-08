// Construct authentic pre-v7 fixtures, removing fields introduced in v7 and v8.
export function removeSelectionPreference(snapshot) {
  delete snapshot.settings.newWordSelectionMode
  for (const tasks of Object.values(snapshot.days)) for (const task of Object.values(tasks)) {
    delete task.presentation
    delete task.settings.newWordSelectionMode
  }
  for (const process of Object.values(snapshot.extraLearning ?? {})) for (const task of process.batches) {
    delete task.presentation
    delete task.settings.newWordSelectionMode
  }
}

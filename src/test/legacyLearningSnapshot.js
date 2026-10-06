// Construct authentic pre-v7 fixtures from current snapshots.
export function removeSelectionPreference(snapshot) {
  delete snapshot.settings.newWordSelectionMode
  for (const tasks of Object.values(snapshot.days)) for (const task of Object.values(tasks)) {
    delete task.settings.newWordSelectionMode
  }
  for (const process of Object.values(snapshot.extraLearning ?? {})) for (const task of process.batches) {
    delete task.settings.newWordSelectionMode
  }
}

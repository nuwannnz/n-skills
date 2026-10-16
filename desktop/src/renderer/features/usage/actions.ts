import { setApp } from '../../app/store';
import { api } from '../../lib/api';

export async function refreshUsage() {
  const usage = await api.usage();
  setApp(s => {
    s.usage = usage;
    if (usage.models?.length) s.models = usage.models;
  });
}

export async function setModel(model: string) {
  setApp(s => { s.modelPref = model; });
  await api.setModel(model);
}

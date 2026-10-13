import { api } from "~/trpc/server";

export default function Health() {
  async function getHealth() {
    const {status} = await api.health.getHealth.query();
    return status;
  }

  return <div>Status: {getHealth()}</div>
}
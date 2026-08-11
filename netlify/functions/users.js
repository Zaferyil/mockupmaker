import { db } from "./_lib/db.js";
import { makeHandlers } from "./_lib/handlers.js";

export default async (req) => makeHandlers(db).users(req);

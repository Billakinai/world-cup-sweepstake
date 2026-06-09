import { useEffect } from "react";
import { navigate } from "../App";

/* Joining now happens directly in the room (one screen, live list).
 * Old /join links from earlier shares still work — they land in the room. */
export default function JoinPage({ id }) {
  useEffect(() => {
    navigate(`/room/${id}`);
  }, [id]);
  return null;
}

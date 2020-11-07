export const playerColor = "yellow";
export const disconnectedColor = "gray";
export const goalColor = "green";
export const defaultTextColor = "white";

export const server =
  process.env.NODE_ENV === "production"
    ? "https://figgie.juraj.space:8081"
    : "http://localhost:8080";

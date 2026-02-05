// src/types/orderTypes.ts
export type OrderState = {
  id: string;
  status: "placed" | "processing" | "shipped" | "delivered";
  items: string[];
};

export type OrderMessage =
  | { _tag: "Process" }
  | { _tag: "Ship" }
  | { _tag: "Deliver" }
  | { _tag: "GetState"; replyTo: (state: OrderState) => void }; 
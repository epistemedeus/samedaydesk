import express from "express";
import { type ServiceConfig } from "./config.js";
import type { CorrespondenceStore } from "./store/types.js";
export declare function createApp(store: CorrespondenceStore, config: ServiceConfig): express.Express;

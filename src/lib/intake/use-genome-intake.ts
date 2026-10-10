import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import * as experiences from "../../experiences/index.ts";
import { chooseGenomeFile, createIntakeRequests } from "./genome-intake.ts";
import { RESULTS_STEP } from "../navigation/journey.ts";
import { publicSampleSource, SAMPLE } from "../catalogues/public-sample.ts";

export function useGenomeIntake(view?: "results") {
  const navigate = useNavigate();
  const [fetching, setFetching] = useState<number | null>(null); // while the public header opens
  const [loadError, setLoadError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [readProgress, setReadProgress] = useState<number>();
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const requests = useRef(createIntakeRequests());
  const busy = preparing || fetching != null;

  // Only client-side navigation keeps a selection. A fresh page has no file.
  useEffect(() => {
    const pending = requests.current;
    return () => pending.cancel();
  }, []);

  async function selectFile(f: File, kind: "upload" | "sample", request: AbortController) {
    const opened = await experiences.openGenomeFile(f, request.signal, (fraction: number) => {
      if (requests.current.isCurrent(request)) setReadProgress(fraction);
    });
    if (!requests.current.isCurrent(request)) return;
    experiences.selectGenome(opened, f.name, kind);
    await navigate({
      to: "/chapter/$n",
      params: { n: view === "results" ? String(RESULTS_STEP + 1) : "1" },
    });
  }

  async function openFile(files: FileList | null) {
    if (!files?.length) return;
    const request = requests.current.begin();
    setFetching(null);
    setPreparing(true);
    setReadProgress(undefined);
    setLoadError("");
    try {
      await selectFile(chooseGenomeFile(files), "upload", request);
    } catch (error) {
      if (requests.current.isCurrent(request))
        setLoadError(
          (error as Error).message || "This file could not be read. Try the public sample.",
        );
    } finally {
      if (requests.current.isCurrent(request)) setPreparing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    void openFile(e.target.files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    void openFile(e.dataTransfer.files);
  }

  // Read just the public sample's header; later chapters request the ranges they use.
  async function loadSample() {
    if (fetching != null || preparing) return;
    const request = requests.current.begin();
    setFetching(0);
    setLoadError("");
    try {
      const opened = await experiences.openPublicSample(publicSampleSource(), request.signal);
      if (!requests.current.isCurrent(request)) return;
      experiences.selectGenome(opened, SAMPLE.name, "sample");
      await navigate({
        to: "/chapter/$n",
        params: { n: view === "results" ? String(RESULTS_STEP + 1) : "1" },
      });
    } catch (error) {
      if (requests.current.isCurrent(request))
        setLoadError(
          (error as Error).message ||
            "The public sample could not be loaded. Choose your own file.",
        );
    } finally {
      if (requests.current.isCurrent(request)) {
        setFetching(null);
      }
    }
  }

  return {
    fetching,
    loadError,
    preparing,
    readProgress,
    drag,
    setDrag,
    fileInput,
    busy,
    onPick,
    onDrop,
    loadSample,
  };
}

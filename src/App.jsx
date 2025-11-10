import React, { useState, useEffect } from "react";
import { Button } from "./components/ui/Button";
import { Input } from "./components/ui/Input";
import { Checkbox } from "./components/ui/Checkbox";
import { Badge } from "./components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "./components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/DropdownMenu";
import { storeImage, getImage, deleteImage } from "./idb.js";

function App() {
  const [queue, setQueue] = useState([]);
  const [images, setImages] = useState({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    loadQueue();
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "updateQueue") {
        setQueue(message.queue);
        // Reload images in case of changes
        const imagePromises = message.queue.map(async (design) => {
          const dataURL = await getImage(design.imageId);
          return { id: design.id, dataURL };
        });
        Promise.all(imagePromises).then((loadedImages) => {
          const imagesObj = {};
          loadedImages.forEach(({ id, dataURL }) => {
            imagesObj[id] = dataURL;
          });
          setImages(imagesObj);
        });
      }
    });
  }, []);

  const loadQueue = async () => {
    const { queue } = await chrome.storage.local.get("queue");
    setQueue(queue || []);
    const imagePromises = (queue || []).map(async (design) => {
      const dataURL = await getImage(design.imageId);
      return { id: design.id, dataURL };
    });
    const loadedImages = await Promise.all(imagePromises);
    const imagesObj = {};
    loadedImages.forEach(({ id, dataURL }) => {
      imagesObj[id] = dataURL;
    });
    setImages(imagesObj);
  };

  const saveQueue = async (newQueue) => {
    await chrome.storage.local.set({ queue: newQueue });
    setQueue(newQueue);
  };

  const addDesigns = async (images, csvData) => {
    const newDesigns = [];
    for (const img of images) {
      const reader = new FileReader();
      const dataURL = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(img);
      });
      const imageId = Date.now() + Math.random();
      await storeImage(imageId, dataURL);
      const name = img.name;
      const nameWithoutExt = name.replace(/\.[^/.]+$/, "").toLowerCase();
      const csv = csvData.find(
        (c) =>
          c.image_name.replace(/\.[^/.]+$/, "").toLowerCase() === nameWithoutExt
      );
      newDesigns.push({
        id: imageId,
        imageId,
        title: csv?.title || name,
        tags: csv?.tags || "",
        description: csv?.description || "",
        status: "Queued",
        uploaded: false,
      });
    }
    saveQueue([...queue, ...newDesigns]);
  };

  const startUpload = () => {
    chrome.runtime.sendMessage({ action: "startUpload" });
  };

  const deleteSelected = () => {
    const newQueue = queue.filter((d) => !selected.includes(d.id));
    selected.forEach(async (id) => {
      await deleteImage(id);
    });
    saveQueue(newQueue);
    setSelected([]);
  };

  const filteredQueue = queue.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "All" || d.status === filter)
  );

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search designs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Filter: {filter}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilter("All")}>
              All
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("Queued")}>
              Queued
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("Uploading")}>
              Uploading
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("Success")}>
              Success
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("Error")}>
              Error
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Upload Designs</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Designs</DialogTitle>
              <DialogDescription>
                Upload images and optionally a CSV file with metadata.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <input type="file" multiple accept="image/*" id="images" />
              <input type="file" accept=".csv" id="csv" />
            </div>
            <DialogFooter>
              <Button
                onClick={async () => {
                  const images = Array.from(
                    document.getElementById("images").files
                  );
                  const csvFile = document.getElementById("csv").files[0];
                  let csvData = [];
                  if (csvFile) {
                    const csvText = await csvFile.text();
                    csvData = parseCSV(csvText);
                  }
                  addDesigns(images, csvData);
                }}
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Button onClick={startUpload} className="w-full mb-4">
        Start Upload
      </Button>
      <Button
        onClick={deleteSelected}
        variant="destructive"
        className="w-full mb-4"
        disabled={selected.length === 0}
      >
        Delete Selected
      </Button>
      <div className="space-y-2">
        {filteredQueue.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 p-2 border rounded"
          >
            <Checkbox
              checked={selected.includes(d.id)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelected([...selected, d.id]);
                } else {
                  setSelected(selected.filter((id) => id !== d.id));
                }
              }}
            />
            <img src={images[d.id]} alt="" className="w-10 h-10 object-cover" />
            <div className="flex-1">
              <div className="font-medium">{d.title}</div>
              <div className="flex gap-1">
                <Badge
                  variant={
                    d.status === "Success"
                      ? "default"
                      : d.status === "Error"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {d.status}
                </Badge>
                <Badge variant="outline">
                  {d.uploaded ? "Uploaded" : "Not Uploaded"}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    return {
      image_name: values[0]?.trim(),
      title: values[1]?.trim(),
      tags: values[2]?.trim(),
      description: values[3]?.trim(),
    };
  });
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

export default App;

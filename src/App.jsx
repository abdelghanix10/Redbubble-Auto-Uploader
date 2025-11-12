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
import { Filter as FunnelIcon, Upload, Search, Square } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/DropdownMenu";
import { storeImage, getImage, deleteImage } from "./idb.js";
import { cn } from "./lib/utils.js";

function App() {
  const [queue, setQueue] = useState([]);
  const [images, setImages] = useState({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });

  useEffect(() => {
    loadQueue();
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "uploadProgress") {
        setUploadProgress(message.progress);
      }
      if (message.action === "updateQueue") {
        setQueue(message.queue);
        // Check if upload is complete (no items with "Uploading" status)
        const hasUploading = message.queue.some(
          (d) => d.status === "Uploading"
        );
        if (!hasUploading) {
          setIsUploading(false);
        }
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
        title: csv?.title || name.replace(/\.[^/.]+$/, ""),
        tags: csv?.tags || "",
        description: csv?.description || "",
        status: "Queued",
        uploaded: false,
      });
    }
    saveQueue([...queue, ...newDesigns]);
  };

  const startUpload = () => {
    setIsUploading(true);
    setUploadProgress({
      current: 0,
      total: queue.filter((d) => d.status === "Queued").length,
    });
    chrome.runtime.sendMessage({ action: "startUpload" });
  };

  const stopUpload = () => {
    setIsUploading(false);
    chrome.runtime.sendMessage({ action: "stopUpload" });
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
      <div className="flex gap-2 mb-4 flex-col sm:flex-row">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search designs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <FunnelIcon />
              Filter: {filter}
            </Button>
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
            <Button className="flex items-center gap-2">
              <Upload />
              Upload Designs
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Designs</DialogTitle>
              <DialogDescription>
                Upload images and optionally a CSV file with metadata.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="images"
                  className="block text-sm font-medium mb-1"
                >
                  Images:
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  id="images"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div>
                <label htmlFor="csv" className="block text-sm font-medium mb-1">
                  CSV File (optional):
                </label>
                <input
                  type="file"
                  accept=".csv"
                  id="csv"
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
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
      <div className="flex gap-2 mb-4">
        <Button
          onClick={isUploading ? stopUpload : startUpload}
          className={`w-full mb-4 ${
            isUploading ? "bg-red-600 hover:bg-red-700" : ""
          }`}
          disabled={
            queue.filter((d) => d.status === "Queued").length === 0 &&
            !isUploading
          }
        >
          {isUploading ? (
            <>
              <Square className="w-4 h-4 mr-2" />
              Stop Upload
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Start Upload
            </>
          )}
        </Button>
        <Button
          onClick={deleteSelected}
          variant="destructive"
          className="w-full mb-4"
          disabled={selected.length === 0}
        >
          Delete Selected
        </Button>
      </div>
      <div className="mb-4 p-4 bg-gray-50 rounded-md">
        <div
          className={`grid gap-4 text-sm ${
            isUploading
              ? "grid-cols-2 sm:grid-cols-4"
              : "grid-cols-1 sm:grid-cols-3"
          }`}
        >
          <div className="text-center">
            <div className="font-semibold text-lg">{filteredQueue.length}</div>
            <div className="text-muted-foreground">Total Images</div>
          </div>
          {isUploading && (
            <div className="text-center">
              <div className="font-semibold text-lg text-blue-600">
                {uploadProgress.total > 0
                  ? Math.round(
                      (uploadProgress.current / uploadProgress.total) * 100
                    )
                  : 0}
                %
              </div>
              <div className="text-muted-foreground">
                Processing ({uploadProgress.current}/{uploadProgress.total})
              </div>
            </div>
          )}
          <div className="text-center">
            <div className="font-semibold text-lg text-orange-600">
              {
                filteredQueue.filter((d) => !d.tags || d.tags.trim() === "")
                  .length
              }
            </div>
            <div className="text-muted-foreground">No Tags</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-lg text-red-600">
              {
                filteredQueue.filter(
                  (d) => !d.description || d.description.trim() === ""
                ).length
              }
            </div>
            <div className="text-muted-foreground">No Description</div>
          </div>
        </div>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 w-12">
                <Checkbox
                  checked={
                    filteredQueue.length > 0 &&
                    selected.length === filteredQueue.length
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelected(filteredQueue.map((d) => d.id));
                    } else {
                      setSelected([]);
                    }
                  }}
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0">
                Design
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0">
                Title
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0">
                Tags
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0">
                Description
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0">
                Status
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0">
                Uploaded
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {filteredQueue.length > 0 ? (
              filteredQueue.map((d) => (
                <tr
                  key={d.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                    {
                      "bg-red-100": !d.tags || !d.description,
                    }
                  )}
                >
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
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
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                    <img
                      src={images[d.id]}
                      alt=""
                      className="w-10 h-10 object-cover rounded-md"
                    />
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0 font-medium">
                    {d.title}
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                    <div className="text-muted-foreground line-clamp-2 max-w-xs">
                      {d.tags && d.tags.trim() !== "" ? (
                        d.tags
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                    <div className="text-muted-foreground line-clamp-2 max-w-xs">
                      {d.description && d.description.trim() !== ""
                        ? d.description
                        : "—"}
                    </div>
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
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
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                    <Badge variant={d.uploaded ? "default" : "destructive"}>
                      {d.uploaded ? "Yes" : "No"}
                    </Badge>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="7"
                  className="p-4 text-center text-muted-foreground"
                >
                  Not Designs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

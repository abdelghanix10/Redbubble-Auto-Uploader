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
  Filter as FunnelIcon,
  Upload,
  Search,
  Square,
  ChevronDown,
} from "lucide-react";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // {id, field}
  const [editValues, setEditValues] = useState({}); // temporary edit values
  const [delayAfterImage, setDelayAfterImage] = useState(30); // seconds
  const [delayAfterBatch, setDelayAfterBatch] = useState(15); // minutes
  const [countdown, setCountdown] = useState(null); // countdown timer in seconds
  const [uploadError, setUploadError] = useState(""); // error message for upload validation

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
      if (message.action === "countdownStart") {
        setCountdown(message.countdown);
      }
      if (message.action === "countdownEnd") {
        setCountdown(null);
      }
    });
  }, []);

  // Countdown timer effect
  useEffect(() => {
    let interval;
    if (countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0) {
      setCountdown(null);
    }
    return () => clearInterval(interval);
  }, [countdown]);

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
    const newImages = {};
    for (const img of images) {
      const reader = new FileReader();
      const dataURL = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(img);
      });
      const imageId = Date.now() + Math.random();
      await storeImage(imageId, dataURL);
      newImages[imageId] = dataURL;
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
    setImages({ ...images, ...newImages });
  };

  const startUpload = () => {
    // Get selected designs that are queued
    const selectedQueuedDesigns = queue.filter(
      (d) => selected.includes(d.id) && d.status === "Queued"
    );

    // Check if any designs are selected
    if (selectedQueuedDesigns.length === 0) {
      setUploadError("Please select at least one design to upload.");
      return;
    }

    // Check maximum limit of 30 designs
    if (selectedQueuedDesigns.length > 30) {
      setUploadError(
        `Cannot upload more than 30 designs at once. You selected ${selectedQueuedDesigns.length} designs. Please select 30 or fewer.`
      );
      return;
    }

    // Validate that all selected designs have titles
    const designsWithoutTitles = selectedQueuedDesigns.filter(
      (d) => !d.title || d.title.trim() === ""
    );

    if (designsWithoutTitles.length > 0) {
      setUploadError(
        `Cannot start upload: ${designsWithoutTitles.length} selected design(s) missing title(s). Please add titles to all selected designs before uploading.`
      );
      return;
    }

    // Clear any previous error
    setUploadError("");

    setIsUploading(true);
    setUploadProgress({
      current: 0,
      total: selectedQueuedDesigns.length,
    });
    chrome.runtime.sendMessage({
      action: "startUpload",
      selectedIds: selectedQueuedDesigns.map((d) => d.id),
      delayAfterImage: delayAfterImage * 1000, // convert to milliseconds
      delayAfterBatch: delayAfterBatch * 60 * 1000, // convert to milliseconds
    });
  };

  const stopUpload = () => {
    setIsUploading(false);
    chrome.runtime.sendMessage({ action: "stopUpload" });
  };

  const deleteSelected = () => {
    const newQueue = queue.filter((d) => !selected.includes(d.id));
    const newImages = { ...images };
    selected.forEach(async (id) => {
      await deleteImage(id);
      delete newImages[id];
    });
    saveQueue(newQueue);
    setImages(newImages);
    setSelected([]);
  };

  const startEditing = (id, field, currentValue) => {
    setEditingCell({ id, field });
    setEditValues({ ...editValues, [`${id}-${field}`]: currentValue });
  };

  const saveEdit = (id, field) => {
    const newValue = editValues[`${id}-${field}`];
    const updatedQueue = queue.map((item) =>
      item.id === id ? { ...item, [field]: newValue } : item
    );
    saveQueue(updatedQueue);
    setEditingCell(null);
    setEditValues({ ...editValues, [`${id}-${field}`]: undefined });
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValues({});
  };

  const handleEditChange = (id, field, value) => {
    setEditValues({ ...editValues, [`${id}-${field}`]: value });
  };

  const filteredQueue = queue.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "All" || d.status === filter)
  );

  // Pagination
  const totalPages = Math.ceil(filteredQueue.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedQueue = filteredQueue.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, itemsPerPage]);

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b">
        <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
          <Upload className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Redbubble Auto Uploader
          </h1>
          <p className="text-sm text-gray-600">
            Automate uploading designs to Redbubble
          </p>
        </div>
      </div>

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
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                  // Clear the file inputs
                  document.getElementById("images").value = "";
                  document.getElementById("csv").value = "";
                  setIsDialogOpen(false);
                }}
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {/* Delay Settings */}
      <div className="mb-4 p-4 bg-blue-50 rounded-md border border-blue-200">
        <h3 className="text-sm font-medium text-blue-900 mb-3">
          Upload Delay Settings
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-blue-800 mb-1">
              Delay after each image (seconds)
            </label>
            <Input
              type="number"
              value={delayAfterImage}
              onChange={(e) => setDelayAfterImage(Number(e.target.value))}
              min="0"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-800 mb-1">
              Delay after every 15 images (minutes)
            </label>
            <Input
              type="number"
              value={delayAfterBatch}
              onChange={(e) => setDelayAfterBatch(Number(e.target.value))}
              min="0"
              className="w-full"
            />
          </div>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <Button
          onClick={isUploading ? stopUpload : startUpload}
          className={`w-full mb-4 ${
            isUploading ? "bg-red-600 hover:bg-red-700" : ""
          }`}
          disabled={selected.length === 0 && !isUploading}
        >
          {isUploading ? (
            <>
              <Square className="w-4 h-4 mr-2" />
              Stop Upload
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Selected ({selected.length})
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
      {uploadError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{uploadError}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setUploadError("")}
                className="inline-flex rounded-md p-1.5 text-red-400 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <span className="sr-only">Dismiss</span>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 p-4 bg-gray-50 rounded-md">
        <div
          className={`grid gap-4 text-sm ${
            isUploading && countdown
              ? "grid-cols-2 sm:grid-cols-5"
              : isUploading
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
          {countdown && (
            <div className="text-center">
              <div className="font-semibold text-lg text-orange-600">
                {Math.floor(countdown / 60)}:
                {(countdown % 60).toString().padStart(2, "0")}
              </div>
              <div className="text-muted-foreground">Next upload in</div>
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
                    paginatedQueue.length > 0 &&
                    paginatedQueue.every((d) => selected.includes(d.id))
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const newSelected = [...selected];
                      paginatedQueue.forEach((d) => {
                        if (!newSelected.includes(d.id)) {
                          newSelected.push(d.id);
                        }
                      });
                      setSelected(newSelected);
                    } else {
                      const paginatedIds = paginatedQueue.map((d) => d.id);
                      setSelected(
                        selected.filter((id) => !paginatedIds.includes(id))
                      );
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
              paginatedQueue.map((d) => (
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
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0 font-medium min-w-60">
                    {editingCell?.id === d.id &&
                    editingCell?.field === "title" ? (
                      <div className="flex gap-2">
                        <Input
                          value={editValues[`${d.id}-title`] ?? d.title}
                          onChange={(e) =>
                            handleEditChange(d.id, "title", e.target.value)
                          }
                          className="h-8"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(d.id, "title");
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={() => saveEdit(d.id, "title")}
                          className="h-8 px-2"
                        >
                          ✓
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelEdit}
                          className="h-8 px-2"
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="cursor-pointer hover:bg-gray-100 p-1 rounded"
                        onClick={() => startEditing(d.id, "title", d.title)}
                      >
                        {d.title}
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0 min-w-60">
                    {editingCell?.id === d.id &&
                    editingCell?.field === "tags" ? (
                      <div className="flex gap-2">
                        <textarea
                          value={editValues[`${d.id}-tags`] ?? d.tags}
                          onChange={(e) =>
                            handleEditChange(d.id, "tags", e.target.value)
                          }
                          className="flex h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                          placeholder="Enter tags..."
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(d.id, "tags")}
                            className="h-8 px-2"
                          >
                            ✓
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            className="h-8 px-2"
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="cursor-pointer hover:bg-gray-100 p-1 rounded"
                        onClick={() => startEditing(d.id, "tags", d.tags)}
                      >
                        <div className="text-muted-foreground line-clamp-2 max-w-xs">
                          {d.tags && d.tags.trim() !== "" ? (
                            d.tags
                          ) : (
                            <span className="text-gray-400 italic">—</span>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0 min-w-60">
                    {editingCell?.id === d.id &&
                    editingCell?.field === "description" ? (
                      <div className="flex gap-2">
                        <textarea
                          value={
                            editValues[`${d.id}-description`] ?? d.description
                          }
                          onChange={(e) =>
                            handleEditChange(
                              d.id,
                              "description",
                              e.target.value
                            )
                          }
                          className="flex h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                          placeholder="Enter description..."
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelEdit();
                          }}
                          autoFocus
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => saveEdit(d.id, "description")}
                            className="h-8 px-2"
                          >
                            ✓
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            className="h-8 px-2"
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="cursor-pointer hover:bg-gray-100 p-1 rounded"
                        onClick={() =>
                          startEditing(d.id, "description", d.description)
                        }
                      >
                        <div className="text-muted-foreground line-clamp-2 max-w-xs">
                          {d.description && d.description.trim() !== "" ? (
                            d.description
                          ) : (
                            <span className="text-gray-400 italic">—</span>
                          )}
                        </div>
                      </div>
                    )}
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
                  No Designs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filteredQueue.length > 0 && (
        <div className="flex justify-between items-center mt-4">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Page{" "}
              <span className="font-semibold">
                {currentPage} of {totalPages}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex gap-1"
                  >
                    <span>{itemsPerPage}</span>
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setItemsPerPage(25)}>
                    25
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setItemsPerPage(50)}>
                    50
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setItemsPerPage(75)}>
                    75
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setItemsPerPage(100)}>
                    100
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              variant="outline"
              className="px-4"
            >
              Previous
            </Button>
            <Button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              variant="outline"
              className="px-4"
            >
              Next
            </Button>
          </div>
        </div>
      )}
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

import dynamodb from "./dynamodb";

import {
  PutCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";

import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { useState, useEffect, useCallback } from "react";
import { Amplify } from "aws-amplify";
import { withAuthenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

import awsConfig from "./aws-config";
import s3 from "./s3";

import {
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

Amplify.configure(awsConfig);

const docClient = DynamoDBDocumentClient.from(dynamodb);

function App({ signOut, user }) {
  const [selectedImage, setSelectedImage] =
    useState(null);

  const [caption, setCaption] =
    useState("");

  const [posts, setPosts] = useState([]);

  const [loading, setLoading] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [likedPosts, setLikedPosts] =
    useState(new Set());

  const [currentView, setCurrentView] =
    useState("feed");

  // Username state
  const [customUsername, setCustomUsername] = useState("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState("");

  // Get user ID from Cognito
  const userId = user?.signInDetails?.loginId || user?.username || user?.userId;
  
  // Display username - use custom if set, otherwise use email
  const currentUsername = customUsername || userId;

  // Fetch user's custom username from DynamoDB
  const fetchUserUsername = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await docClient.send(
        new GetCommand({
          TableName: "UserProfiles",
          Key: {
            userId: userId,
          },
        })
      );

      if (response.Item && response.Item.username) {
        setCustomUsername(response.Item.username);
      }
    } catch (err) {
      console.error("Failed to fetch username:", err);
      // Don't show error if table/item doesn't exist yet
    }
  }, [userId]);

  // Fetch posts
  const fetchPosts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await docClient.send(
        new ScanCommand({
          TableName: "FramesPosts",
        })
      );

      const sortedPosts = (
        response.Items || []
      ).sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );

      setPosts(sortedPosts);

    } catch (err) {
      console.error(err);
      setError("Failed to load posts.");

    } finally {
      setLoading(false);
    }
  };

  // On app load, fetch username and posts
  useEffect(() => {
    fetchUserUsername();
    fetchPosts();
  }, [fetchUserUsername]);

  // Save custom username
  const saveUsername = async () => {
    if (!tempUsername.trim()) {
      setError("Username cannot be empty");
      return;
    }

    try {
      setError(null);
      
      await docClient.send(
        new PutCommand({
          TableName: "UserProfiles",
          Item: {
            userId: userId,
            username: tempUsername.trim(),
            updatedAt: new Date().toISOString(),
          },
        })
      );

      setCustomUsername(tempUsername.trim());
      setEditingUsername(false);
      setTempUsername("");

    } catch (err) {
      console.error("Error saving username:", err);
      setError(`Failed to save username: ${err.message}`);
    }
  };

  const uploadToS3 = async () => {
    if (!selectedImage) return;

    setUploading(true);
    setError(null);

    try {
      const fileName = `${Date.now()}-${selectedImage.name}`;

      const params = {
        Bucket: "frames-images-suji",
        Key: `uploads/${fileName}`,
        Body: selectedImage,
        ContentType: selectedImage.type,
      };

      await s3.send(
        new PutObjectCommand(params)
      );

      const imageUrl = `https://frames-images-suji.s3.eu-west-2.amazonaws.com/uploads/${fileName}`;

      const post = {
        postId: fileName,
        imageUrl: imageUrl,
        username: currentUsername,
        userId: userId,
        createdAt: new Date().toISOString(),
        likes: 0,
        caption: caption,
      };

      await docClient.send(
        new PutCommand({
          TableName: "FramesPosts",
          Item: post,
        })
      );

      setSelectedImage(null);
      setCaption("");

      await fetchPosts();

    } catch (err) {
      console.error(err);
      setError("Upload failed.");

    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async (post) => {
    try {
      const alreadyLiked =
        likedPosts.has(post.postId);

      const newLiked = new Set(likedPosts);

      if (alreadyLiked) {
        newLiked.delete(post.postId);
      } else {
        newLiked.add(post.postId);
      }

      setLikedPosts(newLiked);

      const newLikeCount = alreadyLiked
        ? (post.likes || 0) - 1
        : (post.likes || 0) + 1;

      await docClient.send(
        new UpdateCommand({
          TableName: "FramesPosts",
          Key: {
            postId: post.postId,
          },
          UpdateExpression:
            "SET likes = :l",
          ExpressionAttributeValues: {
            ":l": newLikeCount,
          },
        })
      );

      setPosts((prevPosts) =>
        prevPosts.map((p) =>
          p.postId === post.postId
            ? {
                ...p,
                likes: newLikeCount,
              }
            : p
        )
      );

    } catch (error) {
      console.error(error);
    }
  };

  const deletePost = async (post) => {
    try {
      const imageKey =
        post.imageUrl.split(
          ".amazonaws.com/"
        )[1];

      await s3.send(
        new DeleteObjectCommand({
          Bucket: "frames-images-suji",
          Key: imageKey,
        })
      );

      await docClient.send(
        new DeleteCommand({
          TableName: "FramesPosts",
          Key: {
            postId: post.postId,
          },
        })
      );

      setPosts((prevPosts) =>
        prevPosts.filter(
          (p) =>
            p.postId !== post.postId
        )
      );

    } catch (error) {
      console.error(error);
      setError("Failed to delete post.");
    }
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();

    const diffMs = now - date;

    const diffMins = Math.floor(
      diffMs / 60000
    );

    const diffHours = Math.floor(
      diffMs / 3600000
    );

    const diffDays = Math.floor(
      diffMs / 86400000
    );

    if (diffMins < 1) return "now";

    if (diffMins < 60)
      return `${diffMins}m ago`;

    if (diffHours < 24)
      return `${diffHours}h ago`;

    if (diffDays < 7)
      return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const displayedPosts =
    currentView === "profile"
      ? posts.filter(
          (post) =>
            post.userId === userId
        )
      : posts;

  return (
    <div
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

        backgroundColor: "#fafafa",

        minHeight: "100vh",
      }}
    >
      {/* Navbar */}
      <nav
        style={{
          backgroundColor: "white",

          padding: "16px 20px",

          display: "flex",

          justifyContent:
            "space-between",

          alignItems: "center",

          boxShadow:
            "0 1px 3px rgba(0,0,0,0.08)",

          position: "sticky",

          top: 0,

          zIndex: 100,
        }}
      >
        <div
          style={{
            display: "flex",

            alignItems: "center",

            gap: "24px",
          }}
        >
          <h1
            style={{
              margin: 0,

              fontSize: "22px",

              fontWeight: "700",
            }}
          >
            📸 Frames
          </h1>

          <div
            style={{
              display: "flex",

              gap: "14px",
            }}
          >
            <button
              onClick={() =>
                setCurrentView("feed")
              }
              style={{
                border: "none",

                background: "none",

                cursor: "pointer",

                fontWeight:
                  currentView === "feed"
                    ? "700"
                    : "400",

                fontSize: "15px",
              }}
            >
              Feed
            </button>

            <button
              onClick={() =>
                setCurrentView(
                  "profile"
                )
              }
              style={{
                border: "none",

                background: "none",

                cursor: "pointer",

                fontWeight:
                  currentView ===
                  "profile"
                    ? "700"
                    : "400",

                fontSize: "15px",
              }}
            >
              Profile
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",

            alignItems: "center",

            gap: "20px",
          }}
        >
          <span
            style={{
              fontSize: "14px",

              color: "#666",
            }}
          >
            {currentUsername}
          </span>

          <button
            onClick={signOut}
            style={{
              padding: "8px 16px",

              border: "1px solid #ddd",

              backgroundColor: "white",

              borderRadius: "6px",

              cursor: "pointer",

              fontSize: "14px",

              fontWeight: "500",
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div
        style={{
          maxWidth: "500px",

          margin: "0 auto",

          padding: "20px",
        }}
      >
        {/* Error */}
        {error && (
          <div
            style={{
              backgroundColor: "#fee",

              border: "1px solid #fcc",

              color: "#c33",

              padding: "12px 16px",

              borderRadius: "8px",

              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        {/* Username Settings - ONLY on Profile View */}
        {currentView === "profile" && (
          <div
            style={{
              backgroundColor: "white",

              padding: "24px",

              borderRadius: "12px",

              marginBottom: "24px",

              boxShadow:
                "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <h2
              style={{
                margin: "0 0 16px 0",

                fontSize: "18px",

                fontWeight: "600",
              }}
            >
              👤 Username
            </h2>

            {!editingUsername ? (
              <div>
                <p
                  style={{
                    margin: "0 0 16px 0",

                    fontSize: "14px",

                    color: "#666",
                  }}
                >
                  {customUsername ? `@${customUsername}` : "No username set"}
                </p>

                <button
                  onClick={() => {
                    setEditingUsername(true);
                    setTempUsername(customUsername);
                  }}
                  style={{
                    padding: "10px 16px",

                    border:
                      "1px solid #ddd",

                    backgroundColor:
                      "white",

                    borderRadius: "8px",

                    cursor: "pointer",

                    fontSize: "14px",

                    fontWeight: "500",
                  }}
                >
                  Edit Username
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Enter username"
                  value={tempUsername}
                  onChange={(e) =>
                    setTempUsername(
                      e.target.value
                    )
                  }
                  style={{
                    width: "100%",

                    padding: "12px",

                    border:
                      "1px solid #ddd",

                    borderRadius: "8px",

                    fontSize: "14px",

                    marginBottom: "16px",

                    boxSizing:
                      "border-box",
                  }}
                />

                <div
                  style={{
                    display: "flex",

                    gap: "10px",
                  }}
                >
                  <button
                    onClick={() => {
                      setEditingUsername(
                        false
                      );
                      setTempUsername("");
                    }}
                    style={{
                      flex: 1,

                      padding:
                        "10px 16px",

                      border:
                        "1px solid #ddd",

                      backgroundColor:
                        "white",

                      borderRadius:
                        "8px",

                      cursor:
                        "pointer",

                      fontSize: "14px",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={
                      saveUsername
                    }
                    style={{
                      flex: 1,

                      padding:
                        "10px 16px",

                      border: "none",

                      backgroundColor:
                        "#007AFF",

                      borderRadius:
                        "8px",

                      cursor:
                        "pointer",

                      color: "white",

                      fontWeight:
                        "600",

                      fontSize: "14px",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create Post - ONLY on Profile View */}
        {currentView === "profile" && (
          <div
            style={{
              backgroundColor: "white",

              padding: "24px",

              borderRadius: "12px",

              marginBottom: "24px",

              boxShadow:
                "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <h2
              style={{
                margin: "0 0 16px 0",

                fontSize: "18px",

                fontWeight: "600",
              }}
            >
              Share a moment
            </h2>

            <button
              onClick={() =>
                document
                  .getElementById(
                    "fileInput"
                  )
                  .click()
              }
              style={{
                width: "100%",

                padding: "12px 16px",

                border:
                  "2px dashed #ddd",

                backgroundColor:
                  "#fafafa",

                borderRadius: "8px",

                cursor: "pointer",

                fontSize: "14px",

                marginBottom: "16px",
              }}
            >
              📁 Choose photo
            </button>

            <input
              id="fileInput"
              type="file"
              accept="image/*"
              style={{
                display: "none",
              }}
              onChange={(e) => {
                const file =
                  e.target.files[0];

                if (file) {
                  if (
                    file.size >
                    10 *
                      1024 *
                      1024
                  ) {
                    setError(
                      "Image must be smaller than 10MB"
                    );

                    return;
                  }

                  setSelectedImage(file);

                  setError(null);
                }
              }}
            />

            <textarea
              placeholder="Write a caption..."
              value={caption}
              onChange={(e) =>
                setCaption(
                  e.target.value
                )
              }
              style={{
                width: "100%",

                padding: "12px",

                border:
                  "1px solid #ddd",

                borderRadius: "8px",

                resize: "none",

                minHeight: "90px",

                fontSize: "14px",

                fontFamily: "inherit",

                boxSizing:
                  "border-box",
              }}
            />

            {selectedImage && (
              <div
                style={{
                  marginTop: "20px",
                }}
              >
                <div
                  style={{
                    borderRadius:
                      "12px",

                    overflow:
                      "hidden",

                    marginBottom:
                      "16px",

                    backgroundColor:
                      "#f5f5f5",
                  }}
                >
                  <img
                    src={URL.createObjectURL(
                      selectedImage
                    )}
                    alt="preview"
                    style={{
                      width: "100%",

                      display:
                        "block",

                      maxHeight:
                        "400px",

                      objectFit:
                        "cover",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",

                    gap: "10px",
                  }}
                >
                  <button
                    onClick={() =>
                      setSelectedImage(
                        null
                      )
                    }
                    style={{
                      flex: 1,

                      padding:
                        "10px 16px",

                      border:
                        "1px solid #ddd",

                      backgroundColor:
                        "white",

                      borderRadius:
                        "8px",

                      cursor:
                        "pointer",
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={
                      uploadToS3
                    }
                    disabled={
                      uploading
                    }
                    style={{
                      flex: 1,

                      padding:
                        "10px 16px",

                      border: "none",

                      backgroundColor:
                        uploading
                          ? "#ccc"
                          : "#007AFF",

                      borderRadius:
                        "8px",

                      cursor:
                        uploading
                          ? "not-allowed"
                          : "pointer",

                      color: "white",

                      fontWeight:
                        "600",
                    }}
                  >
                    {uploading
                      ? "Uploading..."
                      : "Post"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feed/Posts - Shows on both Feed and Profile */}
        <div>
          {loading ? (
            <div
              style={{
                textAlign: "center",

                padding: "40px",

                color: "#999",
              }}
            >
              Loading posts...
            </div>
          ) : displayedPosts.length ===
            0 ? (
            <div
              style={{
                textAlign: "center",

                padding: "40px",

                color: "#999",
              }}
            >
              No posts yet.
            </div>
          ) : (
            displayedPosts.map(
              (post) => (
                <div
                  key={post.postId}
                  style={{
                    backgroundColor:
                      "white",

                    borderRadius:
                      "12px",

                    marginBottom:
                      "20px",

                    overflow:
                      "hidden",

                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      padding:
                        "12px 16px",

                      borderBottom:
                        "1px solid #f0f0f0",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,

                        fontSize:
                          "14px",

                        fontWeight:
                          "600",
                      }}
                    >
                      {
                        post.username
                      }
                    </p>

                    <p
                      style={{
                        margin:
                          "4px 0 0 0",

                        fontSize:
                          "12px",

                        color:
                          "#999",
                      }}
                    >
                      {formatDate(
                        post.createdAt
                      )}
                    </p>
                  </div>

                  {/* Image */}
                  <div
                    style={{
                      backgroundColor:
                        "#f5f5f5",

                      aspectRatio:
                        "4/3",

                      overflow:
                        "hidden",
                    }}
                  >
                    <img
                      src={
                        post.imageUrl
                      }
                      alt="post"
                      style={{
                        width: "100%",

                        height:
                          "100%",

                        objectFit:
                          "cover",
                      }}
                    />
                  </div>

                  {/* Footer */}
                  <div
                    style={{
                      padding:
                        "12px 16px",
                    }}
                  >
                    <div
                      style={{
                        display:
                          "flex",

                        justifyContent:
                          "space-between",

                        alignItems:
                          "center",

                        marginBottom:
                          "10px",
                      }}
                    >
                      <button
                        onClick={() =>
                          toggleLike(
                            post
                          )
                        }
                        style={{
                          background:
                            "none",

                          border:
                            "none",

                          cursor:
                            "pointer",

                          padding: 0,
                        }}
                      >
                        <span
                          style={{
                            marginRight:
                              "8px",
                          }}
                        >
                          {likedPosts.has(
                            post.postId
                          )
                            ? "❤️"
                            : "🤍"}
                        </span>

                        <span
                          style={{
                            fontSize:
                              "14px",

                            color:
                              "#666",
                          }}
                        >
                          {post.likes ||
                            0}{" "}
                          likes
                        </span>
                      </button>

                      {currentView ===
                        "profile" && (
                        <button
                          onClick={() =>
                            deletePost(
                              post
                            )
                          }
                          style={{
                            backgroundColor:
                              "#ff4d4f",

                            color:
                              "white",

                            border:
                              "none",

                            padding:
                              "8px 14px",

                            borderRadius:
                              "8px",

                            cursor:
                              "pointer",

                            fontSize:
                              "12px",

                            fontWeight:
                              "600",
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    {post.caption && (
                      <p
                        style={{
                          margin: 0,

                          fontSize:
                            "14px",

                          lineHeight:
                            "1.5",

                          color:
                            "#333",
                        }}
                      >
                        {
                          post.caption
                        }
                      </p>
                    )}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default withAuthenticator(App);

import jQuery from "jquery";
import "./grn_kit.css";
import { Spinner } from "kintone-ui-component/lib/spinner";

(($) => {
  "use strict";
  // コピー対象のboxnoteテンプレートのファイルID
  const BOX_TARGET_FILE_ID = "XXXXXXXX"; // TODO: コピーしたいNoteに合わせて要変更

  // datastoreに格納する際のkeyの値
  const datastoreKey = "jp.co.cybozu.schedule.box";

  // GaroonのプロキシAPIの設定
  const GAROON_PROXY_API_CONF = {
    copyNote: {
      code: "copyNote",
      method: "POST",
      url: "https://api.box.com/2.0/files"
    },
    createSharedLink: {
      code: "createSharedLink",
      method: "PUT",
      url: "https://api.box.com/2.0/files"
    },
    getApiToken: {
      code: "getApiToken",
      method: "POST",
      url: "https://api.box.com/oauth2/token"
    },
    getUserId: {
      code: "getUserId",
      method: "GET",
      url: "https://api.box.com/2.0/users"
    },
    getCollaborations: {
      code: "getCollaborations",
      method: "GET",
      url: "https://api.box.com/2.0/files"
    },
    addUserToCollaborations: {
      code: "addUserToCollaborations",
      method: "POST",
      url: "https://api.box.com/2.0/collaborations"
    }
  };

  const ERROR_MESSAGE = {
    FAIL_EXEC_PROCY_API:
      "プロキシAPIの実行に失敗しました。プロキシAPI設定を確認してください。",
    FAIL_GET_ELEMENTS:
      "連携用HTML要素の取得に失敗しました。予定の連携メニューの設定を確認してください。",
    FAIL_COPY_BOXNOTE: "boxnoteの作成に失敗しました。",
    FAIL_CREATE_SHARED_LINK: "共有リンクの作成に失敗しました。",
    FAIL_GET_COLLABORATIONS:
      "ファイルのコラボレーションリストの取得に失敗しました。",
    FAIL_GET_API_TOKEN: "APIトークンの取得に失敗しました。",
    FAIL_GET_USER_ID: "Boxユーザーの取得に失敗しました。"
  };

  /**
   * client credentials認証によりBoxのAPIトークンを取得する関数
   * @returns {Promise}
   */
  async function getApiToken() {
    const { code, method, url } = GAROON_PROXY_API_CONF.getApiToken;
    return garoon.base.proxy.send(code, url, method, {}, {}).then((resp) => {
      if (resp[1] !== 200) {
        throw new Error(ERROR_MESSAGE.FAIL_GET_API_TOKEN);
      }
      return JSON.parse(resp[0]).access_token;
    });
  }

  /**
   * Boxユーザーの内ユーザーIDを取得する関数
   * @param {String} accessToken
   * @returns {Promise}
   */
  async function getUserId(accessToken) {
    const { code, method, url } = GAROON_PROXY_API_CONF.getUserId;
    const headers = {
      Authorization: `Bearer ${accessToken}`
    };
    const { email } = garoon.base.user.getLoginUser();
    const urlWithParam = `${url}/?filter_term=${email}`;
    return garoon.base.proxy
      .send(code, urlWithParam, method, headers, {})
      .then((resp) => {
        const respData = JSON.parse(resp[0]);
        if (resp[1] !== 200 || respData.total_count !== 1) {
          throw new Error(ERROR_MESSAGE.FAIL_GET_USER_ID);
        }
        return respData.entries[0].id;
      });
  }

  /**
   * ファイルのコラボレーション(アクセス権)を取得する関数
   * @param {String} accessToken
   * @returns {Promise}
   */
  async function getAccessibleUserIds(accessToken) {
    const { code, method, url } = GAROON_PROXY_API_CONF.getCollaborations;
    const headers = {
      Authorization: `Bearer ${accessToken}`
    };
    const urlWithParam = `${url}/${BOX_TARGET_FILE_ID}/collaborations`;
    return garoon.base.proxy
      .send(code, urlWithParam, method, headers, {})
      .then((resp) => {
        if (resp[1] !== 200) {
          throw new Error(ERROR_MESSAGE.FAIL_GET_COLLABORATIONS);
        }
        return JSON.parse(resp[0])
          .entries.filter((entry) => {
            return entry.accessible_by.type === "user";
          })
          .map((entry) => {
            return entry.accessible_by.id;
          });
      });
  }

  /**
   * ファイルのコラボレーション(アクセス権)に操作ユーザーを追加する
   * @param {String} accessToken
   * @returns {Promise}
   */
  async function addUserToAccessibleList(accessToken, userId) {
    const { code, method, url } = GAROON_PROXY_API_CONF.addUserToCollaborations;
    const headers = {
      Authorization: `Bearer ${accessToken}`
    };
    const data = {
      accessible_by: {
        id: userId,
        type: "user"
      },
      item: {
        id: BOX_TARGET_FILE_ID,
        type: "file"
      },
      role: "editor"
    };
    return garoon.base.proxy
      .send(code, url, method, headers, data)
      .then((resp) => {
        if (resp[1] !== 201) {
          throw new Error(ERROR_MESSAGE.FAIL_COPY_BOXNOTE);
        }
      });
  }

  /**
   * box APIで既存ファイルのコピーを行う関数
   * boxnote用のAPIは存在しないため，テンプレートを作成しておき，
   * それをコピーする仕様としている。
   * box API reference: https://developer.box.com/reference
   * @param {String} accessToken
   * @returns {Promise} 作成したnoteのid
   */
  async function copyNote(accessToken, userId) {
    const { code, method, url } = GAROON_PROXY_API_CONF.copyNote;
    const noteName = garoon.schedule.event.get().subject;
    const urlWithParam = `${url}/${BOX_TARGET_FILE_ID}/copy`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "as-user": userId
    };
    const data = {
      parent: {
        id: "0"
      },
      name: `${noteName}.boxnote`
    };
    return garoon.base.proxy
      .send(code, urlWithParam, method, headers, data)
      .then((resp) => {
        if (resp[1] !== 201) {
          throw new Error(ERROR_MESSAGE.FAIL_COPY_BOXNOTE);
        }

        return JSON.parse(resp[0]).id;
      });
  }

  /**
   * box APIで共有リンクのURLを作成、取得する関数
   * @param {Number} id
   * @param {String} accessToken
   * @returns {Promise}
   */
  async function createSharedLink(id, accessToken, userId) {
    const { code, url, method } = GAROON_PROXY_API_CONF.createSharedLink;
    const urlWithParam = `${url}/${id}?fields=shared_link`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "as-user": userId
    };
    const data = {
      shared_link: {
        access: "company"
      }
    };
    return garoon.base.proxy
      .send(code, urlWithParam, method, headers, data)
      .then((resp) => {
        if (resp[1] !== 200) {
          throw new Error(ERROR_MESSAGE.FAIL_CREATE_SHARED_LINK);
        }
        return JSON.parse(resp[0]).shared_link.url;
      });
  }

  /**
   * Garoonのスケジュール、datastoreにboxの共有リンクを埋め込む関数
   * @param {String} sharedLink
   */
  async function setSharedLinkToSchedule(sharedLink) {
    const value = {
      value: { sharedLink }
    };

    const { id } = garoon.schedule.event.get();
    const path = `/api/v1/schedule/events/${id}/datastore/${datastoreKey}`;
    garoon.api(path, "POST", value).then(() => {
      location.reload();
    });
  }

  /**
   * Garoonのスケジュール、datastoreの共有リンクを削除する関数
   * @param {String} sharedLink
   */
  function clearSharedLink() {
    const { id } = garoon.schedule.event.get();
    const path = `/api/v1/schedule/events/${id}/datastore/${datastoreKey}`;
    garoon
      .api(path, "DELETE", {})
      .then(() => {
        location.reload();
      })
      .catch((error) => {
        alert(error.message);
        console.error(error);
      });
  }

  /**
   * box noteを作成する関数
   */
  async function createNote() {
    const spinner = new Spinner();
    try {
      spinner.open();
      const accessToken = await getApiToken();
      const [userId, accessibleUserIds] = await Promise.all([
        getUserId(accessToken),
        getAccessibleUserIds(accessToken)
      ]);

      if (!accessibleUserIds.includes(userId)) {
        await addUserToAccessibleList(accessToken, userId);
      }

      const copiedNoteId = await copyNote(accessToken, userId);
      const sharedLink = await createSharedLink(
        copiedNoteId,
        accessToken,
        userId
      );
      setSharedLinkToSchedule(sharedLink);
    } catch (error) {
      alert(error.message);
      console.error(error);
    } finally {
      spinner.close();
    }
  }

  /**
   * box noteの作成ボタンを表示する関数
   */
  const showCreateButton = () => {
    if ($("#create-note-button").length !== 1) {
      throw new Error(ERROR_MESSAGE.FAIL_GET_ELEMENTS);
    }
    $("#create-note-button").on("click", createNote);
    $("#create-note-button").show();
  };

  /**
   * datastoreから取得したbocの共有リンクをもとに、
   * 埋め込みiframeを作成、表示する関数
   * @param {String} sharedLink
   */
  const showExistedNote = (sharedLink) => {
    const sharedLinkCode = sharedLink.replace(
      /^https:\/\/.+\.box\.com\/s\//,
      ""
    );
    // const baseUrl = sharedLink.replace(sharedLinkCode, "");
    const baseUrl = "https://app.box.com";
    const embeddedUrl = `${baseUrl}/embed/s/${sharedLinkCode}?showParentPath=false`;
    const $linkNoteButton = $("#link-note-button");
    const $embeddedBoxNote = $("#embedded-box-note");
    const $disconnectNoteButton = $("#disconnect-note-button");
    if (
      $linkNoteButton.length !== 1 ||
      $embeddedBoxNote.length !== 1 ||
      $disconnectNoteButton.length !== 1
    ) {
      throw new Error(ERROR_MESSAGE.FAIL_GET_ELEMENTS);
    }

    $linkNoteButton.on("click", () => {
      window.open(sharedLink, "_blank");
    });
    $linkNoteButton.show();

    $embeddedBoxNote[0].src = embeddedUrl;
    $embeddedBoxNote.show();

    $disconnectNoteButton.on("click", clearSharedLink);
    $disconnectNoteButton.show();
  };

  garoon.events.on("schedule.event.detail.show", (event) => {
    const dataStoreData = garoon.schedule.event.datastore.get(datastoreKey);
    const boxSharedUrl = dataStoreData ? dataStoreData.value.sharedLink : "";

    if ($("#box-content").length !== 1) {
      return;
    }

    if (boxSharedUrl === "") {
      showCreateButton();
    } else {
      showExistedNote(boxSharedUrl);
    }

    return event;
  });
})(jQuery.noConflict(true));

(function() {
  "use strict";
  const myJQuery = jQuery.noConflict(true);
  (function($) {
    // oauth.ioで定義
    const OAUTHIO_APP_NAME = "box";
    // oauth.ioで取得
    const OAUTHIO_PUBLIC_KEY = "XXXXXXXX";
    // コピー対象のboxnoteテンプレートのファイルID
    const BOX_TARGET_FILE_ID = "0000000";
    // GaroonのプロキシAPIの設定
    const GAROON_PROXY_API_CONF = {
      copyNote: {
        code: "copyNote",
        method: "POST",
        url: "https://api.box.com/2.0"
      },
      createSharedLink: {
        code: "createSharedLink",
        method: "PUT",
        URL: "https://api.box.com/2.0"
      }
    };
    const ERROR_MESSAGE = {
      FAIL_EXEC_PROCY_API:
        "プロキシAPIの実行に失敗しました。\nプロキシAPI設定を確認してください。",
      FAIL_GET_ELEMENTS:
        "連携用HTML要素の取得に失敗しました。\n予定の連携メニューの設定を確認してください。",
      FAIL_COPY_BOXNOTE: "boxnoteの作成に失敗しました。",
      FAIL_CREATE_SHARED_LINK: "共有リンクの作成に失敗しました。"
    };

    /**
     * OAuth.ioのSDKを利用し、boxのアクセストークンを取得する関数
     * @returns {Promise}
     */
    async function getAccessToken() {
      OAuth.initialize(OAUTHIO_PUBLIC_KEY);
      const OauthResult = await OAuth.popup(OAUTHIO_APP_NAME, {
        cache: true
      });
      return OauthResult.access_token;
    }

    /**
     * box APIで既存ファイルのコピーを行う関数
     * boxnote用のAPIは存在しないため，テンプレートを作成しておき，
     * それをコピーする仕様としている。
     * box API reference: https://developer.box.com/reference
     * @param {String} accessToken
     * @returns {Promise} garoon.Promise
     */
    async function copyNote(accessToken) {
      // Garoonで定義
      const proxyCode = GAROON_PROXY_API_CONF.copyNote.code;
      const noteName = garoon.schedule.event.get().subject;
      const url = `https://api.box.com/2.0/files/${BOX_TARGET_FILE_ID}/copy`;
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      };
      const data = {
        parent: {
          id: "0"
        },
        name: `${noteName}.boxnote`
      };
      return garoon.base.proxy.send(proxyCode, url, "POST", headers, data);
    }

    /**
     * box APIで共有リンクのURLを作成、取得する関数
     * @param {Number} id
     * @param {String} accessToken
     * @returns {Promise} garoon.Promise
     */
    async function createSharedLink(id, accessToken) {
      // Garoonで定義
      const proxyCode = GAROON_PROXY_API_CONF.createSharedLink.code;
      const url = `https://api.box.com/2.0/files/${id}?fields=shared_link`;
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      };
      const data = {
        shared_link: {
          access: "company"
        }
      };
      return garoon.base.proxy.send(proxyCode, url, "PUT", headers, data);
    }

    /**
     * Garoonのスケジュール、AdditionalItemsにboxの共有リンクを埋め込む関数
     * @param {String} sharedLink
     */
    const setSharedLinkToSchedule = sharedLink => {
      const scheduleId = garoon.schedule.event.get().id;
      const url = `/api/v1/schedule/events/${scheduleId}`;
      const params = {
        additionalItems: {
          item: {
            value: sharedLink
          }
        }
      };
      garoon.api(url, "PATCH", params, () => {
        location.reload();
      });
    };

    /**
     * box noteを作成する関数
     * Oauth認証によるアクセストークンの取得、
     * box noteの作成
     * 作成したnoteの共有リンク取得
     * 共有リンクをAdditionalItemに代入する。
     */
    async function createNote() {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return;
      }
      // boxnoteコピー
      const resultOfCopy = await copyNote(accessToken).catch(() => {
        alert(ERROR_MESSAGE.FAIL_EXEC_PROCY_API);
      });
      const detailOfCopyNote = JSON.parse(resultOfCopy[0]);
      // box note作成の実行結果確認
      if (resultOfCopy[1] !== 201) {
        alert(
          `${ERROR_MESSAGE.FAIL_COPY_BOXNOTE}\nstatus:${detailOfCopyNote.status}\nmessage:${detailOfCopyNote.code}`
        );
        return;
      }

      // boxnote共有リンク取得
      const fileId = detailOfCopyNote.id;
      const resultOfCreateLink = await createSharedLink(
        fileId,
        accessToken
      ).catch(() => {
        alert(ERROR_MESSAGE.FAIL_EXEC_PROCY_API);
      });
      const detailOfCreateLink = JSON.parse(resultOfCreateLink[0]);
      // 共有リンク作成の実行結果確認
      if (resultOfCreateLink[1] !== 200) {
        alert(
          `${ERROR_MESSAGE.FAIL_CREATE_SHARED_LINK}\nstatus:${detailOfCreateLink.status}\nmessage:${detailOfCreateLink.code}`
        );
        return;
      }

      setSharedLinkToSchedule(
        JSON.parse(resultOfCreateLink[0]).shared_link.url
      );
    }

    /**
     * box noteの作成ボタンを表示する関数
     */
    const showCreateBotton = () => {
      if ($("#create-note-button").length !== 1) {
        alert(ERROR_MESSAGE.FAIL_GET_ELEMENTS);
        return;
      }
      $("#create-note-button").click(createNote);
      $("#create-note-button").show();
    };

    const clearSharedLinkOfSchedule = () => {
      setSharedLinkToSchedule("");
    };

    /**
     * AdditinoalItemsから取得したbocの共有リンクをもとに、
     * 埋め込みiframeを作成、表示する関数
     * @param {String} sharedLink
     */
    const showExistedNote = sharedLink => {
      const sharedLinkCode = sharedLink.replace("https://app.box.com/s/", "");
      const embeddedUrl = `https://app.box.com/embed/s/${sharedLinkCode}?showParentPath=false`;
      const $linkNoteButton = $("#link-note-button");
      const $embeddedBoxNote = $("#embedded-box-note");
      const $disconnectNoteButton = $("#disconnect-note-button");
      if (
        $linkNoteButton.length !== 1 ||
        $embeddedBoxNote.length !== 1 ||
        $disconnectNoteButton.length !== 1
      ) {
        alert(ERROR_MESSAGE.FAIL_GET_ELEMENTS);
        return;
      }
      $linkNoteButton.click(() => {
        window.open(sharedLink, "_blank");
      });
      $linkNoteButton.show();
      $embeddedBoxNote[0].src = embeddedUrl;
      $embeddedBoxNote.show();
      $disconnectNoteButton.click(clearSharedLinkOfSchedule);
      $disconnectNoteButton.show();
    };

    garoon.events.on("schedule.event.detail.show", event => {
      const boxSharedUrl = event.event.additionalItems.item.value;

      // 連携対象の予定メニューに表示されるhtml要素がなければ対象外として処理終了
      if ($("#box-content").length !== 1) {
        return;
      }

      // boxの連携URLの存在確認
      if (boxSharedUrl === "") {
        showCreateBotton();
      } else {
        // AdditionalItemlsにboxの共有リンク以外が入っていた場合処理終了
        if (!boxSharedUrl.includes("https://app.box.com/s/")) {
          return;
        }
        showExistedNote(boxSharedUrl);
      }
    });
  })(myJQuery);
})();

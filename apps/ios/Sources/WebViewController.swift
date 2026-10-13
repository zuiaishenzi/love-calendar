import UIKit
import WebKit

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    private var web: WKWebView!
    private let server = URL(string: Bundle.main.object(forInfoDictionaryKey: "OurDaysServerURL") as? String ?? "https://love.11215739.xyz:11961/")!
    private var downloads: [ObjectIdentifier: URL] = [:]
    private let errorLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.98, green: 0.97, blue: 0.97, alpha: 1)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = "OurDaysiOS/" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0")
        config.userContentController.add(self, name: "ourDaysClipboard")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        ])
        let back = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(backGesture(_:)))
        back.edges = .left
        view.addGestureRecognizer(back)
        errorLabel.text = "暂时无法连接，请点击重试"
        errorLabel.textAlignment = .center
        errorLabel.textColor = .secondaryLabel
        errorLabel.isUserInteractionEnabled = true
        errorLabel.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(retry)))
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        errorLabel.isHidden = true
        view.addSubview(errorLabel)
        NSLayoutConstraint.activate([errorLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor), errorLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor), errorLabel.widthAnchor.constraint(equalTo: view.widthAnchor), errorLabel.heightAnchor.constraint(equalToConstant: 60)])
        retry()
    }
    private func trusted(_ url: URL?) -> Bool {
        guard let url = url else { return false }
        return url.scheme == "https" && url.host == server.host && url.port == server.port
    }
    @objc private func retry() { errorLabel.isHidden = true; web.isHidden = false; web.load(URLRequest(url: server)) }
    @objc private func backGesture(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended, trusted(web.url) else { return }
        web.evaluateJavaScript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}if(typeof view!=='undefined'&&view!=='calendar'){switchView('calendar');return true;}return false;})()") { [weak self] value, _ in
            if (value as? Bool) == false, self?.web.canGoBack == true { self?.web.goBack() }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "ourDaysClipboard", message.frameInfo.isMainFrame,
              trusted(message.frameInfo.request.url), trusted(web.url),
              let text = message.body as? String, text.utf8.count <= 80000 else { return }
        UIPasteboard.general.string = text
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if trusted(url) {
            if url.path == "/app/check-update", trusted(web.url), navigationAction.targetFrame?.isMainFrame == true {
                decisionHandler(.cancel)
                checkUpdate()
                return
            }
            decisionHandler(navigationAction.shouldPerformDownload ? .download : .allow)
            return
        }
        decisionHandler(.cancel)
        if navigationAction.navigationType == .linkActivated && ["https", "http", "mailto", "tel"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard trusted(navigationResponse.response.url) else { decisionHandler(.cancel); return }
        if navigationResponse.canShowMIMEType { decisionHandler(.allow) } else { decisionHandler(.download) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard trusted(response.url) else { completionHandler(nil); return }
        do {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let file = directory.appendingPathComponent(URL(fileURLWithPath: suggestedFilename).lastPathComponent)
            downloads[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch { completionHandler(nil) }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        present(sheet, animated: true)
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        showMessage("下载失败，请稍后重试")
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let sameOrigin = origin.protocol == "https" && origin.host == server.host && origin.port == (server.port ?? 443)
        decisionHandler(sameOrigin && trusted(frame.request.url) && trusted(web.url) && type == .microphone ? .prompt : .deny)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { errorLabel.isHidden = true }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { web.isHidden = true; errorLabel.isHidden = false }
    }
    private func showMessage(_ message: String) {
        let alert = UIAlertController(title: "朝夕", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default))
        present(alert, animated: true)
    }
    private func checkUpdate() {
        let url = URL(string: "/api/app/update?platform=ios", relativeTo: server)!.absoluteURL
        URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
            guard let self = self else { return }
            guard let data = data, (response as? HTTPURLResponse)?.statusCode == 200,
                  let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DispatchQueue.main.async { self.showMessage("暂时无法检查更新") }; return
            }
            DispatchQueue.main.async {
                let current = Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0") ?? 0
                guard info["available"] as? Bool == true else { self.showMessage("iOS 安装包暂未发布"); return }
                guard info["packageId"] as? String == "xyz.ourdays.ios", let build = info["versionCode"] as? Int else { self.showMessage("更新信息无效"); return }
                if build <= current { self.showMessage("当前已是最新版本"); return }
                let alert = UIAlertController(title: "发现新版本", message: "请在系统设置的客户端下载中下载。安装需要有效签名与设备授权。", preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "取消", style: .cancel))
                alert.addAction(UIAlertAction(title: "打开下载", style: .default) { _ in self.web.evaluateJavaScript("document.querySelector('#system-dialog').showModal();refreshClientDownloads();", completionHandler: nil) })
                self.present(alert, animated: true)
            }
        }.resume()
    }
}

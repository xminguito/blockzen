import ExpoModulesCore
import GameKit
import UIKit

public class ExpoGameCenterModule: Module {
  private let errorCodeUnavailable = "E_GAMECENTER_UNAVAILABLE"
  private let errorCodeUserCancelled = "E_GAMECENTER_USER_CANCELLED"
  private var gameCenterDelegateRetainer: GameCenterDelegate?

  public func definition() -> ModuleDefinition {
    Name("ExpoGameCenter")

    AsyncFunction("authenticate") { (promise: Promise) in
      self.authenticate(promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("submitScore") { (score: Int, leaderboardId: String, promise: Promise) in
      self.submitScore(score: Int64(score), leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("fetchFriendsScores") { (leaderboardId: String, promise: Promise) in
      self.fetchFriendsScores(leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("presentDashboard") { (leaderboardId: String?, promise: Promise) in
      self.presentDashboard(leaderboardId: leaderboardId, promise: promise)
    }
    .runOnQueue(.main)
  }

  // MARK: - Availability Check

  private func ensureGameCenterAvailable(promise: Promise) -> Bool {
    true
  }

  private func topViewController() -> UIViewController? {
    guard let windowScene = UIApplication.shared.connectedScenes
      .filter({ $0.activationState == .foregroundActive })
      .compactMap({ $0 as? UIWindowScene })
      .first,
      let window = windowScene.windows.first(where: { $0.isKeyWindow }) else {
      return nil
    }
    var top = window.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }

  // MARK: - Authentication

  private func authenticate(promise: Promise) {
    guard ensureGameCenterAvailable(promise: promise) else { return }

    let localPlayer = GKLocalPlayer.local

    if localPlayer.isAuthenticated {
      DispatchQueue.main.async {
        let result: [String: Any] = [
          "playerId": localPlayer.gamePlayerID,
          "alias": localPlayer.alias
        ]
        promise.resolve(result)
      }
      return
    }

    let errCancelled = errorCodeUserCancelled
    let errUnavailable = errorCodeUnavailable
    localPlayer.authenticateHandler = { [weak self] viewController, error in
      DispatchQueue.main.async {
        if let vc = viewController {
          self?.topViewController()?.present(vc, animated: true)
        } else if let error = error as NSError? {
          let errMsg = error.localizedDescription.lowercased()
          if error.domain == GKError.errorDomain {
            if error.code == 9 || errMsg.contains("cancel") || errMsg.contains("denied") {
              promise.reject(errCancelled, "User cancelled Game Center sign-in")
            } else {
              promise.reject(errUnavailable, error.localizedDescription)
            }
          } else {
            promise.reject(errUnavailable, error.localizedDescription)
          }
        } else if localPlayer.isAuthenticated {
          let result: [String: Any] = [
            "playerId": localPlayer.gamePlayerID,
            "alias": localPlayer.alias
          ]
          promise.resolve(result)
        } else {
          promise.reject(errUnavailable, "Game Center authentication could not be completed")
        }
      }
    }
  }

  // MARK: - Submit Score (iOS 14+)

  private func submitScore(score: Int64, leaderboardId: String, promise: Promise) {
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    if #available(iOS 14.0, *) {
      GKLeaderboard.submitScore(
        Int(score),
        context: 0,
        player: GKLocalPlayer.local,
        leaderboardIDs: [leaderboardId]
      ) { error in
        DispatchQueue.main.async {
          if let error = error {
            promise.reject(self.errorCodeUnavailable, error.localizedDescription)
          } else {
            promise.resolve(nil)
          }
        }
      }
    } else {
      promise.reject(errorCodeUnavailable, "submitScore requires iOS 14 or later")
    }
  }

  // MARK: - Fetch Friends Scores

  private func fetchFriendsScores(leaderboardId: String, promise: Promise) {
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    let errUnavailable = errorCodeUnavailable
    GKLeaderboard.loadLeaderboards(IDs: [leaderboardId]) { leaderboards, error in
      DispatchQueue.main.async {
        if let error = error {
          promise.reject(errUnavailable,
            error.localizedDescription)
          return
        }

        guard let board = leaderboards?.first else {
          promise.resolve([])
          return
        }

        board.loadEntries(for: .friendsOnly, timeScope: .allTime, range: NSRange(location: 1, length: 25)) { local, entries, totalCount, loadError in
          DispatchQueue.main.async {
            if let loadError = loadError {
              promise.reject(errUnavailable,
                loadError.localizedDescription)
              return
            }

            let items = (entries ?? []).map { entry -> [String: Any] in
              [
                "rank": entry.rank,
                "score": entry.score,
                "playerId": entry.player.gamePlayerID,
                "alias": entry.player.alias,
                "formattedScore": entry.formattedScore
              ]
            }
            promise.resolve(items)
          }
        }
      }
    }
  }

  // MARK: - Present Dashboard

  private func presentDashboard(leaderboardId: String?, promise: Promise) {
    guard ensureGameCenterAvailable(promise: promise) else { return }

    guard GKLocalPlayer.local.isAuthenticated else {
      promise.reject(errorCodeUnavailable, "Player is not authenticated with Game Center")
      return
    }

    guard let top = topViewController() else {
      promise.reject(errorCodeUnavailable, "Could not find a view controller to present from")
      return
    }

    let delegate = GameCenterDelegate(promise: promise) { [weak self] in
      self?.gameCenterDelegateRetainer = nil
    }
    gameCenterDelegateRetainer = delegate

    let vc: GKGameCenterViewController
    if let lid = leaderboardId, !lid.isEmpty {
      vc = GKGameCenterViewController(leaderboardID: lid, playerScope: .global, timeScope: .allTime)
    } else {
      vc = GKGameCenterViewController(state: .leaderboards)
    }
    vc.gameCenterDelegate = delegate

    top.present(vc, animated: true)
  }
}

// MARK: - GKGameCenterControllerDelegate

private class GameCenterDelegate: NSObject, GKGameCenterControllerDelegate {
  let promise: Promise
  let onDismiss: (() -> Void)?

  init(promise: Promise, onDismiss: (() -> Void)? = nil) {
    self.promise = promise
    self.onDismiss = onDismiss
  }

  func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
    gameCenterViewController.dismiss(animated: true)
    promise.resolve(nil)
    onDismiss?()
  }
}

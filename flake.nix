{
  outputs = { self, nixpkgs }: {
    defaultPackage.x86_64-linux =
      with nixpkgs.legacyPackages.x86_64-linux;

      mkShell {
        name = "vscode-ghc-simple";
        nativeBuildInputs = [ nodejs ];
      };
  };
}
